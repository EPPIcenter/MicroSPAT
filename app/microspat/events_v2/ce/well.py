import eventlet

from app.microspat.schemas import WellSchema, ChannelSchema
from app.microspat.models import Well, Channel
from ..base import base_get, table_to_string_mapping, make_namespace, extract_ids
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
