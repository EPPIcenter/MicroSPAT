from app.microspat.schemas import ArtifactEstimatorSchema
from app.microspat.models import ArtifactEstimator
from app.microspat.events.base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ArtifactEstimator]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ArtifactEstimatorSchema()

socketio.on_event('get', base_get(ArtifactEstimator, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(ArtifactEstimator, schema, schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)
