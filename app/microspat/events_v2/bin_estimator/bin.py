from flask_socketio import send

from app.microspat.schemas import BinSchema
from app.microspat.models import Bin
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Bin]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = BinSchema()


# @socketio.on('get', namespace='/' + JSON_NAMESPACE)
# def get_bin(json):
#     bin = Bin.query.get(int(json['id']))
#     dump = schema.dumps(bin)
#     res = {
#         'bin': dump.data
#     }
#     send(res)

socketio.on_event('get', base_get(Bin, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)