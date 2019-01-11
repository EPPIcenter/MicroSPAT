from app.microspat.schemas import SampleLocusAnnotationSchema
from app.microspat.models import SampleLocusAnnotation
from ..base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[SampleLocusAnnotation]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = SampleLocusAnnotationSchema()

socketio.on_event('get', base_get(SampleLocusAnnotation, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(SampleLocusAnnotation, schema, schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)
