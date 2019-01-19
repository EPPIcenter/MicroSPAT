from app.microspat.schemas import WellSchema, ChannelSchema, WellListSchema
from app.microspat.models import Well, Channel
from ..base import table_to_string_mapping, make_namespace, extract_ids, TaskNotifier, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Well]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

WELL_NAMESPACE = table_to_string_mapping[Well]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]

well_schema = WellSchema()
undetailed_well_schema = WellListSchema()
channel_schema = ChannelSchema()

socketio.on_event('get_updated', base_get_updated(Well, well_schema, undetailed_well_schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_well(json):
    ids = extract_ids(json)
    channels = []
    wells = []
    for well_id in ids:
        well = Well.query.get(well_id)
        if well:
            wells.append(well)
            channels += well.channels

    missing_ids = list(set(ids) - set([_.id for _ in wells]))

    if missing_ids:
        socketio.emit('get_failed', {WELL_NAMESPACE: missing_ids}, namespace=make_namespace(WELL_NAMESPACE))

    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('get', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()

    well_dump = well_schema.dumps(wells, many=True)
    socketio.emit('get', {WELL_NAMESPACE: well_dump.data}, namespace=make_namespace(WELL_NAMESPACE))
    socketio.sleep()


@socketio.on('recalculate_ladder', namespace=SOCK_NAMESPACE)
def recalculate_ladder(json):
    i = 1
    well_id = json['well_id']
    peak_indices = json['ladder_peak_indices']
    task = 'recalculate_ladder'

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, well_id=well_id)

    task_notifier.emit_task_start()
    socketio.sleep()

    if not well_id:
        task_notifier.emit_task_failure(message="Well Not Selected.")
        return

    if not isinstance(peak_indices, list):
        task_notifier.emit_task_failure(message="Peak Indices malformed.")

    well = Well.query.get(well_id)

    if not well:
        task_notifier.emit_task_failure(message="Well No Longer Exists. Reload Page.")

        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': 5,
            'current_state': i,
            'message': 'Recalculating Well Ladder...'
        })

    i += 1
    well.calculate_base_sizes(peak_indices)

    for channel in well.channels:
        if channel.locus_id:
            task_notifier.emit_task_progress(progress={
                'style': 'determinate',
                'total': 5,
                'current_state': i,
                'message': 'Recalculating Well Ladder...'
            })
            channel.find_max_data_point()
            i += 1
    task_notifier.emit_task_success(message="Well Ladder Recalculated Successfully.")
