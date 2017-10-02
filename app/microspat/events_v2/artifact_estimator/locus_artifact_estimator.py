from app.microspat.models import LocusArtifactEstimator
from app.microspat.schemas import LocusArtifactEstimatorSchema
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[LocusArtifactEstimator]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LocusArtifactEstimatorSchema()


# @socketio.on('get', namespace='/' + JSON_NAMESPACE)
# def get_locus_artifact_estimator(json):
#     locus_artifact_estimator = LocusArtifactEstimator.query.get(int(json['id']))
#     dump = schema.dumps(locus_artifact_estimator)
#     res = {
#         'locus_artifact_estimator': dump.data,
#         'errors': dump.errors
#     }
#     send(res)

socketio.on_event('get', base_get(LocusArtifactEstimator, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)