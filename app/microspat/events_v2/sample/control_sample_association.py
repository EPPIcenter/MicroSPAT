from app.microspat.schemas import ControlSampleAssociationSchema
from app.microspat.models import ControlSampleAssociation
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ControlSampleAssociation]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = ControlSampleAssociationSchema()

socketio.on_event('get', base_get(ControlSampleAssociation, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)