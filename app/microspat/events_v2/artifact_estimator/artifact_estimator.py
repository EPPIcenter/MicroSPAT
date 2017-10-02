from flask_socketio import send

from app.microspat.schemas import ArtifactEstimatorSchema
from app.microspat.models import ArtifactEstimator
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ArtifactEstimator]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ArtifactEstimatorSchema()

#
# @socketio.on('get', namespace='/' + JSON_NAMESPACE)
# def get_artifact_estimator(json):
#     artifact_estimator = ArtifactEstimator.query.get(int(json['id']))
#     dump = schema.dumps(artifact_estimator)
#     res = {
#         'artifact_estimator': dump.data,
#         'errors': dump.errors
#     }
#     send(res)

socketio.on_event('get', base_get(ArtifactEstimator, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)