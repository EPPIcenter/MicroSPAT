import sqlite3
import sqlalchemy.exc

from app.microspat.schemas import LocusSchema
from app.microspat.models import Locus, Project, LocusSet, locus_set_association_table
from ..base import base_list, base_get, make_namespace, table_to_string_mapping, TaskNotifier
from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[Locus]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = LocusSchema()

socketio.on_event('get', base_get(Locus, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Locus, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('save', namespace=SOCK_NAMESPACE)
def save_locus(json):
    task = 'save'
    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    try:
        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': 2,
            'current_state': 1,
            'message': 'Saving Locus...'
        })
        locus = Locus(label=json.pop('label'),
                      color=json.pop('color'),
                      min_base_length=int(json.pop('min_base_length')),
                      max_base_length=int(json.pop('max_base_length')),
                      nucleotide_repeat_length=int(json.pop('nucleotide_repeat_length')))
        db.session.add(locus)
        for k, v in json.items():
            setattr(locus, k, v)
        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': 2,
            'current_state': 2,
            'message': 'Saving Locus...'
        })
        db.session.commit()
    except KeyError:
        task_notifier.emit_task_failure(message=f'Locus Malformed.')
        db.session.rollback()
        return
    except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
        task_notifier.emit_task_failure(message=f'Label Must Be Unique.')
        db.session.rollback()
        return
    except Exception as e:
        print("Exception Not Caught", e)
        task_notifier.emit_task_failure(message=f'Something Bad Happened Trying to Save Locus... Restart App')
        db.session.rollback()
        return
    task_notifier.emit_task_success(message='Locus Save Complete')


@socketio.on('delete', namespace=SOCK_NAMESPACE)
def delete_locus(json):
    task = 'delete'
    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    try:
        locus_id = json.pop('id')

        if locus_id:
            locus_id = int(locus_id)
            task_notifier.emit_task_progress(progress={
                'style': 'determinate',
                'total': 2,
                'current_state': 1,
                'message': 'Deleting Locus...'
            })
            locus_used = db.session.query(
                Project.query
                    .join(LocusSet)
                    .join(locus_set_association_table)
                    .join(Locus)
                    .filter(Locus.id == locus_id).exists()
            ).scalar()
            locus = Locus.query.get(locus_id)

            if locus_used:
                task_notifier.emit_task_failure(message=f'Cannot Delete Locus {locus.label}. Currently In Use.')
                return

            if locus:
                db.session.delete(locus)
                task_notifier.emit_task_progress(progress={
                    'style': 'determinate',
                    'total': 2,
                    'current_state': 2,
                    'message': 'Deleting Locus...'
                })
                db.session.commit()
                task_notifier.emit_task_success(message="Locus Deletion Complete")
            else:
                task_notifier.emit_task_failure(message=f"Locus Does Not Exist")
            return

    except KeyError:
        task_notifier.emit_task_failure(message=f'Locus Malformed.')
        db.session.rollback()
        return

    except Exception as e:
        print("Exception Not Caught", e)
        task_notifier.emit_task_failure(message=f'Something Bad Happened Trying to Delete Locus... Restart App')
        db.session.rollback()
        return
