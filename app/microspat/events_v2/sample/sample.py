from app.microspat.schemas import SampleSchema
from app.microspat.models import Sample
from ..base import base_get, base_list, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Sample]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = SampleSchema()

socketio.on_event('get', base_get(Sample, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('list', base_list(Sample, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
