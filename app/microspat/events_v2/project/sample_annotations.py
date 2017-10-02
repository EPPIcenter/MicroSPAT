from app.microspat.schemas import ProjectSampleAnnotationsSchema
from app.microspat.schemas import ProjectSampleAnnotations
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ProjectSampleAnnotationsSchema()

socketio.on_event('get', base_get(ProjectSampleAnnotations, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
