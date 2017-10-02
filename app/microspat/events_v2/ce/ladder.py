from app.microspat.schemas import LadderSchema
from app.microspat.models import Ladder
from ..base import base_get, base_list, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Ladder]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LadderSchema()

socketio.on_event('get', base_get(Ladder, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Ladder, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)