import eventlet

from app.microspat.schemas import PlateSchema, WellSchema
from app.microspat.models import Plate, Well
from ..base import extract_ids, table_to_string_mapping, make_namespace, base_list
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[Plate]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

WELL_NAMESPACE = table_to_string_mapping[Well]
PLATE_NAMESPACE = table_to_string_mapping[Plate]

plate_schema = PlateSchema()
well_schema = WellSchema()


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_plate(json):
    ids = extract_ids(json)

    for plate_id in ids:
        p = Plate.query.get(plate_id)
        if p:
            wells = p.wells.all()
            well_dump = well_schema.dumps(wells, many=True)
            socketio.emit('get', {WELL_NAMESPACE: well_dump.data}, namespace=make_namespace(WELL_NAMESPACE))
            eventlet.sleep()

            plate_dump = plate_schema.dumps([p], many=True)
            socketio.emit('get', {PLATE_NAMESPACE: plate_dump.data}, namespace=make_namespace(PLATE_NAMESPACE))
            eventlet.sleep()

socketio.on_event('list', base_list(Plate, plate_schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)