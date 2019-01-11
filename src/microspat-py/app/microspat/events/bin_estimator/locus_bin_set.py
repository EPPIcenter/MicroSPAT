from app.microspat.schemas import LocusBinSetSchema
from app.microspat.models import LocusBinSet
from app.microspat.events.base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[LocusBinSet]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LocusBinSetSchema()

socketio.on_event('get', base_get(LocusBinSet, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(LocusBinSet, schema, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)

