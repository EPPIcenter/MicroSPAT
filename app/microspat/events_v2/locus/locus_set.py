from app.microspat.schemas import LocusSetSchema
from app.microspat.models import LocusSet
from ..base import base_list, base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[LocusSet]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LocusSetSchema()

socketio.on_event('get', base_get(LocusSet, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(LocusSet, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)