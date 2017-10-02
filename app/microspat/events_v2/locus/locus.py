from app.microspat.schemas import LocusSchema
from app.microspat.models import Locus
from ..base import base_list, base_get, make_namespace, table_to_string_mapping
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Locus]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = LocusSchema()

socketio.on_event('get', base_get(Locus, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Locus, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
