from app.microspat.models import LocusArtifactEstimator
from app.microspat.schemas import LocusArtifactEstimatorSchema
from app.microspat.events.base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[LocusArtifactEstimator]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LocusArtifactEstimatorSchema()


socketio.on_event('get', base_get(LocusArtifactEstimator, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(LocusArtifactEstimator, schema, schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)
