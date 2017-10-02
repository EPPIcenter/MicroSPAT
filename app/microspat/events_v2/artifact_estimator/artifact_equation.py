from app.microspat.schemas import ArtifactEquationSchema
from app.microspat.models import ArtifactEquation
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ArtifactEquation]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = ArtifactEquationSchema()


# @socketio.on('get', namespace='/' + JSON_NAMESPACE)
# def get_artifact_equation(json):
#     artifact_equation = ArtifactEquation.query.get(int(json['id']))
#     dump = schema.dumps(artifact_equation)
#     res = {
#         'artifact_equation': dump.data,
#         'errors': dump.errors
#     }
#     send(res)

socketio.on_event('get', base_get(ArtifactEquation, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
