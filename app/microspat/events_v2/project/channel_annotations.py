from app.microspat.schemas import ProjectChannelAnnotationsSchema
from app.microspat.models import ProjectChannelAnnotations
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = ProjectChannelAnnotationsSchema()

socketio.on_event('get', base_get(ProjectChannelAnnotations, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)