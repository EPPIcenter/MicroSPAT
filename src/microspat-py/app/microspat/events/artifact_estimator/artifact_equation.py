from app.microspat.schemas import ArtifactEquationSchema
from app.microspat.models import ArtifactEquation
from app.microspat.events.base import base_get, base_get_updated, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ArtifactEquation]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ArtifactEquationSchema()

socketio.on_event('get', base_get(ArtifactEquation, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(ArtifactEquation, schema, schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)
