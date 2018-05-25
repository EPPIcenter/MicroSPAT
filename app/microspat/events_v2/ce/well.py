import eventlet

from app.microspat.schemas import WellSchema, ChannelSchema
from app.microspat.models import Well, Channel
from ..base import table_to_string_mapping, make_namespace, extract_ids
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
    for well_id in ids:
        well = Well.query.get(well_id)
        if well:
            channels = well.channels
            channel_dump = channel_schema.dumps(channels, many=True)
            socketio.emit('get', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
            eventlet.sleep()

            well_dump = well_schema.dumps([well], many=True)
            socketio.emit('get', {WELL_NAMESPACE: well_dump.data}, namespace=make_namespace(WELL_NAMESPACE))
            eventlet.sleep()


@socketio.on('recalculate_ladder', namespace=SOCK_NAMESPACE)
def recalculate_ladder(json):
    well_id = json['well_id']
    well = Well.query.get(well_id)
    peak_indices = json['ladder_peak_indices']
    print("Recalculating Ladder")
    print(peak_indices)
    if well and isinstance(peak_indices, list):
        # try:
        well.calculate_base_sizes(peak_indices)
        for channel in well.channels:
            if channel.locus_id:
                channel.find_max_data_point()
            # return jsonify(wrap_data({'status': 'Success'}))
        # except Exception as e:
        #     socketio.emit('error', {WELL_NAMESPACE: well_id, "task": "recalculate_ladder"})