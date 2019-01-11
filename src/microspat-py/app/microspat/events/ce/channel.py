from sqlalchemy.orm import noload

from app.microspat.schemas import ChannelSchema, WellSchema, ChannelListSchema
from app.microspat.models import Channel, Well
from ..base import base_get, table_to_string_mapping, make_namespace, extract_ids, base_get_updated
from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[Channel]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

WELL_NAMESPACE = table_to_string_mapping[Well]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]

channel_schema = ChannelSchema()
channel_list_schema = ChannelListSchema()
well_schema = WellSchema(exclude=['plate'])


socketio.on_event('get_updated', base_get_updated(Channel, channel_schema, channel_list_schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_channel(json):
    ids = extract_ids(json)
    channels = []
    wells = []
    for channel_id in ids:
        channel = Channel.query.get(channel_id)
        if channel:
            channels.append(channel)
            well = Well.query.get(channel.well_id)
            wells.append(well)
    missing_ids = list(set(ids) - set([_.id for _ in channels]))

    if missing_ids:
        socketio.emit('get_failed', {CHANNEL_NAMESPACE: missing_ids}, namespace=make_namespace(CHANNEL_NAMESPACE))

    well_dump = well_schema.dumps(wells, many=True)
    socketio.emit('get', {WELL_NAMESPACE: well_dump.data}, namespace=make_namespace(WELL_NAMESPACE))
    socketio.sleep()

    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('get', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()
