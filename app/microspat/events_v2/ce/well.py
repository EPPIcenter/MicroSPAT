import eventlet

from app.microspat.schemas import WellSchema, ChannelSchema
from app.microspat.models import Well, Channel
from ..base import table_to_string_mapping, make_namespace, extract_ids, generate_task_id, emit_task_start, \
    emit_task_failure, emit_task_progress, emit_task_success
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Well]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

WELL_NAMESPACE = table_to_string_mapping[Well]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]

well_schema = WellSchema()
channel_schema = ChannelSchema()


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
    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('get', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()

    well_dump = well_schema.dumps(wells, many=True)
    socketio.emit('get', {WELL_NAMESPACE: well_dump.data}, namespace=make_namespace(WELL_NAMESPACE))
    socketio.sleep()


@socketio.on('recalculate_ladder', namespace=SOCK_NAMESPACE)
def recalculate_ladder(json):
    i = 1
    task = 'recalculate_ladder'
    task_id = generate_task_id()
    well_id = json['well_id']
    peak_indices = json['ladder_peak_indices']

    emit_task_start(task=task,
                    task_id=task_id,
                    task_args={
                        'well_id': well_id
                    },
                    namespace=SOCK_NAMESPACE,
                    data={
                        'well_id': well_id
                    })
    socketio.sleep()

    if not well_id:
        emit_task_failure(task=task,
                          task_id=task_id,
                          task_args={
                              'well_id': well_id
                          },
                          message="Well Not Selected.",
                          namespace=SOCK_NAMESPACE)
        return

    if not isinstance(peak_indices, list):
        emit_task_failure(task=task,
                          task_id=task_id,
                          task_args={
                              'well_id': well_id
                          },
                          message="Peak Indices malformed.",
                          namespace=SOCK_NAMESPACE)

    well = Well.query.get(well_id)

    if not well:
        emit_task_failure(task=task,
                          task_id=task_id,
                          task_args={
                              'well_id': well_id
                          },
                          message="Well No Longer Exists. Reload Page.",
                          namespace=SOCK_NAMESPACE)

    emit_task_progress(task=task,
                       task_id=task_id,
                       task_args={
                           'well_id': well_id
                       },
                       progress={
                           'style': 'determinate',
                           'total': 5,
                           'current_state': i,
                           'message': 'Recalculating Well Ladder...'
                       },
                       namespace=SOCK_NAMESPACE)
    i += 1
    well.calculate_base_sizes(peak_indices)
    for channel in well.channels:
        if channel.locus_id:
            emit_task_progress(task=task,
                               task_id=task_id,
                               task_args={
                                   'well_id': well_id
                               },
                               progress={
                                   'style': 'indeterminate',
                                   'total': 5,
                                   'current_state': i,
                                   'message': 'Recalculating Well Ladder...'
                               },
                               namespace=SOCK_NAMESPACE)
            channel.find_max_data_point()
            i += 1
    emit_task_success(task=task,
                      task_id=task_id,
                      task_args={
                          'well_id': well_id
                      },
                      message="Well Ladder Recalculated Successfully.",
                      namespace=SOCK_NAMESPACE)
