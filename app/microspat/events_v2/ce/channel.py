from app.microspat.schemas import ChannelSchema
from app.microspat.models import Channel
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Channel]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ChannelSchema()

socketio.on_event('get', base_get(Channel, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
