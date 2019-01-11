import sqlite3
import sqlalchemy.exc

from app.microspat.models.sample.exceptions import InvalidAllelesException
from app.microspat.schemas import ControlSchema
from app.microspat.models import Control, ControlSampleAssociation
from app.microspat.events.base import (
    base_get, base_list, table_to_string_mapping, make_namespace, base_get_updated, TaskNotifier
)
from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[Control]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ControlSchema()

socketio.on_event('get', base_get(Control, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(Control, schema, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Control, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('create', namespace=SOCK_NAMESPACE)
def create_control(json):
    task = 'create'
    barcode = json.get('barcode')
    bin_estimator_id = json.get('bin_estimator')
    alleles = json.get('alleles')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, barcode=barcode,
                                 bin_estimator_id=bin_estimator_id, alleles=alleles)

    task_notifier.emit_task_start()

    if not barcode:
        task_notifier.emit_task_failure(message="Control Label Invalid.")
        return

    if not bin_estimator_id:
        task_notifier.emit_task_failure(message="Bin Estimator Invalid, ID Not Found.")

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Creating Control {barcode}...'
    })

    try:
        control = Control(barcode=barcode, bin_estimator_id=bin_estimator_id)
        control.set_alleles(alleles)
        db.session.add(control)
    except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
        task_notifier.emit_task_failure(message="Control Label Must Be Unique.")
        db.session.rollback()
        return
    except InvalidAllelesException:
        task_notifier.emit_task_failure(message="Alleles Invalid, something went wrong... Reload application.")
        db.session.rollback()
        return

    task_notifier.emit_task_success(message=f"Successfully Created Control {barcode}")


@socketio.on('delete', namespace=SOCK_NAMESPACE)
def delete_control(json):
    task = 'delete'
    control_id = json.get('id')
    control = Control.query.get(control_id)

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, control_id=control_id)
    task_notifier.emit_task_start()

    associations = ControlSampleAssociation.query.filter(control_id == control_id).first()

    if associations:
        project = associations.sample_annotation.project
        task_notifier.emit_task_failure(message=f"Control currently in use in {project.title}. Cannot Delete")
        return

    db.session.delete(control)

    task_notifier.emit_task_success(message=f"Successfully deleted {control.barcode}")
