from app.microspat.schemas import ControlSchema
from app.microspat.models import Control
from ..base import base_get, base_list, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Control]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ControlSchema()

socketio.on_event('get', base_get(Control, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Control, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)