from flask_socketio import send

from app.microspat.schemas import BinEstimatorLocusParamsSchema
from app.microspat.models import BinEstimatorLocusParams
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[BinEstimatorLocusParams]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = BinEstimatorLocusParamsSchema()


# @socketio.on('get', namespace='/' + JSON_NAMESPACE)
# def get_artifact_estimator_locus_params(json):
#     locus_params = ArtifactEstimatorLocusParams.query.get(int(json['id']))
#     dump = schema.dumps(locus_params)
#     res = {
#         'artifact_estimator_locus_params': dump.data,
#         'errors': dump.errors
#     }
#     send(res)

socketio.on_event('get', base_get(BinEstimatorLocusParams, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
