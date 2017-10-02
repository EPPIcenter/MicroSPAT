from app.microspat.schemas import QuantificationBiasEstimatorLocusParamsSchema
from app.microspat.models import QuantificationBiasEstimatorLocusParams
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[QuantificationBiasEstimatorLocusParams]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = QuantificationBiasEstimatorLocusParamsSchema()

socketio.on_event('get', base_get(QuantificationBiasEstimatorLocusParams, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
