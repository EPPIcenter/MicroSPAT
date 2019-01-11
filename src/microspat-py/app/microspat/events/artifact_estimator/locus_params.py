from app.microspat.schemas import ArtifactEstimatorLocusParamsSchema
from app.microspat.models import ArtifactEstimatorLocusParams
from app.microspat.events.base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ArtifactEstimatorLocusParams]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ArtifactEstimatorLocusParamsSchema()


socketio.on_event('get', base_get(ArtifactEstimatorLocusParams, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated',
                  base_get_updated(ArtifactEstimatorLocusParams, schema, schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)
