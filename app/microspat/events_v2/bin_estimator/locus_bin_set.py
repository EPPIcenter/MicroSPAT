from flask_socketio import send

from app.microspat.schemas import LocusBinSetSchema
from app.microspat.models import LocusBinSet
from ..base import base_get, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[LocusBinSet]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)
schema = LocusBinSetSchema()


# @socketio.on('get', namespace='/' + JSON_NAMESPACE)
# def get_locus_bin_set(json):
#     locus_bin_set = LocusBinSet.query.get(int(json['id']))
#     dump = schema.dumps(locus_bin_set)
#     res = {
#         'locus_bin_set': dump.data,
#         'errors': dump.errors
#     }
#     send(res)

socketio.on_event('get', base_get(LocusBinSet, schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
