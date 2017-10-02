from app.microspat.schemas import GenotypeSchema
from app.microspat.models import Genotype
from ..base import base_get, make_namespace, table_to_string_mapping
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Genotype]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = GenotypeSchema()

socketio.on_event('get', base_get(Genotype, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)