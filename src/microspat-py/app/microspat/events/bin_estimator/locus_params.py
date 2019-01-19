from flask_socketio import send

from app.microspat.schemas import BinEstimatorLocusParamsSchema
from app.microspat.models import BinEstimatorLocusParams
from ..base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[BinEstimatorLocusParams]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = BinEstimatorLocusParamsSchema()

socketio.on_event('get', base_get(BinEstimatorLocusParams, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(BinEstimatorLocusParams, schema, schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)

