from app.microspat.schemas import ControlSampleAssociationSchema
from app.microspat.models import ControlSampleAssociation
from ..base import base_get, table_to_string_mapping, make_namespace, base_get_updated
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ControlSampleAssociation]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = ControlSampleAssociationSchema()

socketio.on_event('get', base_get(ControlSampleAssociation, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(ControlSampleAssociation, schema, schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)
