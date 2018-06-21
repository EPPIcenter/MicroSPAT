import sqlite3

import sqlalchemy.exc

from app.microspat.schemas import LocusSetSchema
from app.microspat.models import LocusSet, Locus, Project
from ..base import base_list, base_get, table_to_string_mapping, make_namespace, TaskNotifier
from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[LocusSet]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LocusSetSchema()

socketio.on_event('get', base_get(LocusSet, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(LocusSet, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('save', namespace=SOCK_NAMESPACE)
def save_locus_set(json):
    task = 'save'
    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    try:
        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': 2,
            'current_state': 1,
            'message': 'Saving Locus Set...'
        })
        locus_set = LocusSet()
        db.session.add(locus_set)
        locus_set.label = json.pop('label')

        locus_ids = json.pop('loci')
        loci = Locus.query.filter(Locus.id.in_(locus_ids)).all()
        locus_set.loci = loci
        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': 2,
            'current_state': 2,
            'message': 'Saving Locus Set...'
        })
        db.session.commit()
    except KeyError:
        task_notifier.emit_task_failure(message=f'Locus Set Malformed.')
        db.session.rollback()
        return
    except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
        task_notifier.emit_task_failure(message=f'Label Must Be Unique.')
        db.session.rollback()
        return
    except Exception as e:
        print("Exception Not Caught", e)
        task_notifier.emit_task_failure(message=f'Something Bad Happened Trying to Save Locus Set... Restart App')
        db.session.rollback()
        return
    task_notifier.emit_task_success(message='Locus Set Save Complete')


@socketio.on('delete', namespace=SOCK_NAMESPACE)
def delete_locus_set(json):
    print("Deleting Locus Set")
    task = 'delete'
    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    try:
        locus_set_id = json.pop('id')

        if locus_set_id:
            locus_set_id = int(locus_set_id)
            task_notifier.emit_task_progress(progress={
                'style': 'determinate',
                'total': 2,
                'current_state': 1,
                'message': 'Delete Locus Set...'
            })
            locus_set_used = db.session.query(
                Project.query.join(LocusSet).filter(LocusSet.id == locus_set_id).exists()
            ).scalar()
            locus_set = LocusSet.query.get(locus_set_id)

            if locus_set_used:
                task_notifier.emit_task_failure(message=f'Cannot Delete Locus Set {locus_set.label}. Currently In Use.')
                return

            if locus_set:
                db.session.delete(locus_set)
                task_notifier.emit_task_progress(progress={
                    'style': 'determinate',
                    'total': 2,
                    'current_state': 2,
                    'message': 'Deleting Locus Set...'
                })
                db.session.commit()
                task_notifier.emit_task_success(message="Locus Set Deletion Complete")
            else:
                task_notifier.emit_task_failure(message="Locus Set Does Not Exist")
            return

    except KeyError:
        task_notifier.emit_task_failure(message="Locus Set Malformed.")
        db.session.rollback()
        return

    except Exception as e:
        print("Exception Not Caught", e)
        task_notifier.emit_task_failure(message="Something Bad Happened Trying to Delete Locus Set... Restart App")
        db.session.rollback()
        return
