import sqlite3
import sqlalchemy.exc

from app.microspat.schemas import LadderSchema
from app.microspat.models import Ladder
from app.microspat.events.base import base_get, base_list, table_to_string_mapping, make_namespace, TaskNotifier
from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[Ladder]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LadderSchema()

socketio.on_event('get', base_get(Ladder, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get(Ladder, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Ladder, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('save', namespace=SOCK_NAMESPACE)
def save_ladder(json):
    task = 'save'
    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    try:
        ladder_id = json.pop('id')
        if ladder_id:
            task_notifier.emit_task_progress(progress={
                'style': 'determinate',
                'total': 2,
                'current_state': 1,
                'message': 'Updating Ladder...'
            })
            ladder = Ladder.query.get(ladder_id)
        else:
            task_notifier.emit_task_progress(progress={
                'style': 'determinate',
                'total': 2,
                'current_state': 1,
                'message': 'Saving New Ladder...'
            })
            ladder = Ladder()
            db.session.add(ladder)
        for k, v in json.items():
            setattr(ladder, k, v)
        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': 2,
            'current_state': 2,
            'message': 'Saving Ladder...'
        })
        db.session.commit()
    except KeyError:
        task_notifier.emit_task_failure(message=f'Ladder Malformed.')
        db.session.rollback()
        return
    except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
        task_notifier.emit_task_failure(message=f'Label Must Be Unique.')
        db.session.rollback()
        return
    except Exception as e:
        # print("Exception Not Caught", e)
        task_notifier.emit_task_failure(message=f'Something Bad Happened Trying to Save Ladder... Restart App')
        db.session.rollback()
        return
    task_notifier.emit_task_success(message='Ladder Save Complete')
