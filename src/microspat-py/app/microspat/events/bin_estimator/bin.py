from app.microspat.schemas import BinSchema
from app.microspat.models import Bin, LocusBinSet
from app.microspat.events.base import base_get, table_to_string_mapping, make_namespace, base_get_updated, TaskNotifier, \
    base_list
from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[Bin]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = BinSchema()

socketio.on_event('get', base_get(Bin, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(Bin, schema, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Bin, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('save_bin', namespace=SOCK_NAMESPACE)
def save_bin(json):
    task = 'save_bin'
    bin_id = json.get('id')
    label = json.get('label')
    base_size = json.get('base_size')
    bin_buffer = json.get('bin_buffer')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)
    task_notifier.emit_task_start()

    if not bin_id:
        task_notifier.emit_task_failure(message="Malformed Save Bin Request: No Bin ID.")
        return

    if not label:
        task_notifier.emit_task_failure(message="Label Invalid.")
        return

    if not base_size:
        task_notifier.emit_task_failure(message="Base Size Invalid.")
        return

    if not bin_buffer:
        task_notifier.emit_task_failure(message="Bin Buffer Invalid.")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Creating Bin {label}...'
    })

    selected_bin = Bin.query.get(bin_id)

    if not selected_bin:
        task_notifier.emit_task_failure(message='Bin No Longer Exists. Reload Application.')
        return

    selected_bin.update(label=label, base_size=base_size, bin_buffer=bin_buffer)

    db.session.commit()

    task_notifier.emit_task_success(message="Successfully Updated Bin.")


@socketio.on('delete_bin', namespace=SOCK_NAMESPACE)
def delete_bin(json):
    task = 'delete_bin'
    bin_id = json.get('id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, bin_id=bin_id)

    task_notifier.emit_task_start()

    if not bin_id:
        task_notifier.emit_task_failure(message="No Bin Selected.")
        return

    bin = Bin.query.get(bin_id)

    if not bin:
        task_notifier.emit_task_failure(message="Bin No Longer Exists. Reload Application")

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Deleting Bin {bin.label}...'
    })

    db.session.delete(bin)
    bin.locus_bin_set.project.parameters_changed(bin.locus_bin_set.locus_id)

    db.session.commit()

    task_notifier.emit_task_success(message="Successfully Deleted Bin.")


@socketio.on('add_bin', namespace=SOCK_NAMESPACE)
def add_bin(json):
    task = 'add_bin'
    base_size = json.get('base_size')
    locus_bin_set_id = json.get('locus_bin_set_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE,
                                 base_size=base_size, locus_bin_set_id=locus_bin_set_id)

    if not base_size:
        task_notifier.emit_task_failure(message="Bin Size Invalid.")

    if not locus_bin_set_id:
        task_notifier.emit_task_failure(message="Locus Bin Set Invalid.")

    locus_bin_set = LocusBinSet.query.get(locus_bin_set_id)

    if not locus_bin_set:
        task_notifier.emit_task_failure(message="Locus Bin Set No Longer Exists. Reload Application")

    b = Bin(label=str(round(base_size)), base_size=base_size, bin_buffer=.75)
    locus_bin_set.bins.append(b)
    db.session.add(b)
    b.notify_updated()

    db.session.commit()
    task_notifier.emit_task_success(message="Succesfully Added Bin")
