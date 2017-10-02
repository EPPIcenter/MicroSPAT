from app.microspat.schemas import GenotypingLocusParamsSchema
from app.microspat.models import GenotypingLocusParams
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[GenotypingLocusParams]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = GenotypingLocusParamsSchema()

socketio.on_event('get', base_get(GenotypingLocusParams, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)