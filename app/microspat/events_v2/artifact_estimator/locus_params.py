from app.microspat.schemas import ArtifactEstimatorLocusParamsSchema
from app.microspat.models import ArtifactEstimatorLocusParams
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ArtifactEstimatorLocusParams]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ArtifactEstimatorLocusParamsSchema()


# @socketio.on('get', namespace='/' + JSON_NAMESPACE)
# def get_artifact_estimator_locus_params(json):
#     locus_param = ArtifactEstimatorLocusParams.query.get(int(json['id']))
#     dump = schema.dumps(locus_param)
#     res = {
#         'artifact_estimator_locus_params': dump.data,
#         'errors': dump.errors
#     }
#     send(res)

socketio.on_event('get', base_get(ArtifactEstimatorLocusParams, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)