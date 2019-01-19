from app.microspat.schemas import ProjectSampleAnnotationsSchema
from app.microspat.models import ProjectSampleAnnotations
from ..base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ProjectSampleAnnotationsSchema()

socketio.on_event('get', base_get(ProjectSampleAnnotations, schema, JSON_NAMESPACE, 2000), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(ProjectSampleAnnotations, schema, schema, JSON_NAMESPACE, 2000), namespace=SOCK_NAMESPACE)
