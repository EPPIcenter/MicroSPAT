from collections import defaultdict
from datetime import datetime

from flask_sqlalchemy import SignallingSession
from sqlalchemy import event
from sqlalchemy.engine import Engine
from marshmallow import Schema

from app import socketio
from app.microspat.events_v2 import make_namespace
from app.microspat.events_v2.base import table_to_string_mapping
from app.microspat.schemas import *


bidirectional_relationships = {
    Sample: ['channels'],
    Channel: ['sample']
}


class UpdateMsgSchema(Schema):
    last_updated = fields.DateTime()
    model = fields.Str()
    id = fields.Str()


update_msg_schema = UpdateMsgSchema()


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, _):
    if db.engine.url.drivername == 'sqlite':
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA cache_size=-1000000")
        cursor.close()


@event.listens_for(SignallingSession, 'after_flush')
def notify_locus_parameter_locked(_, __):
    locus_parameter_subsets = defaultdict(list)
    for target in db.session.dirty:
        if isinstance(target, ProjectLocusParams):
            locus_parameter_subsets[table_to_string_mapping[target.__class__]].append((target.id, target.locked))
    for subset_label in locus_parameter_subsets:
        locus_parameters = locus_parameter_subsets[subset_label]
        socketio.emit('locked', locus_parameters, namespace=make_namespace(subset_label), broadcast=True)


def set_last_updated(_, __, target):
    target.last_updated = datetime.utcnow()


def notify_updated(mapper, conn, target):
    _notify_object_updated(target)


def _notify_object_updated(target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]

    for attr in bidirectional_relationships.get(target_class, []):
        related_objs = getattr(target_class, attr)
        map(_notify_object_updated, related_objs)

    print("Updating class {} with id {}".format(string_mapping, str(target.id)))

    socketio.emit('updated', update_msg_schema.dump({
        'last_updated': target.last_updated,
        'model': string_mapping,
        'id': str(target.id)
    }), namespace=make_namespace(string_mapping), broadcast=True)


def notify_deleted(_, __, target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]
    print("Deleting class {} with id {}".format(string_mapping, str(target.id)))
    socketio.emit('deleted', {
        'model': string_mapping,
        'id': str(target.id)
    }, namespace=make_namespace(string_mapping), broadcast=True)


def notify_created(_, __, target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]
    print("Inserting class {} with id {}".format(string_mapping, str(target.id)))
    socketio.emit('created', {
        'model': string_mapping,
        'id': str(target.id)
    }, namespace=make_namespace(string_mapping), broadcast=True)



monitor_create_classes = (
    Ladder,
    Locus,
    LocusSet,
    GenotypingProject,
    GenotypingLocusParams,
    ArtifactEstimatorProject,
    ArtifactEstimatorLocusParams,
    ArtifactEquation,
    ArtifactEstimator,
    BinEstimatorProject,
    BinEstimatorLocusParams,
    LocusBinSet,
    Bin,
    QuantificationBiasEstimatorProject,
    QuantificationBiasEstimatorLocusParams,
    Sample,
    Control,
    ControlSampleAssociation,
    Plate
)

monitor_update_classes = (
    Ladder,
    Locus,
    LocusSet,
    ProjectSampleAnnotations,
    SampleLocusAnnotation,
    ProjectChannelAnnotations,
    Genotype,
    GenotypingProject,
    GenotypingLocusParams,
    ArtifactEstimatorProject,
    ArtifactEstimatorLocusParams,
    ArtifactEquation,
    ArtifactEstimator,
    BinEstimatorProject,
    BinEstimatorLocusParams,
    LocusBinSet,
    Bin,
    QuantificationBiasEstimatorProject,
    QuantificationBiasEstimatorLocusParams,
    Sample,
    Control,
    ControlSampleAssociation,
    Plate,
    Well,
    Channel
)

monitor_delete_classes = (
    Ladder,
    Locus,
    LocusSet,
    GenotypingProject,
    GenotypingLocusParams,
    ArtifactEstimatorProject,
    ArtifactEstimatorLocusParams,
    ArtifactEquation,
    ArtifactEstimator,
    BinEstimatorProject,
    BinEstimatorLocusParams,
    LocusBinSet,
    Bin,
    QuantificationBiasEstimatorProject,
    QuantificationBiasEstimatorLocusParams,
    Sample,
    Control,
    ControlSampleAssociation,
    Plate
)

for _ in monitor_create_classes:
    event.listen(_, 'after_insert', notify_created)

for _ in monitor_update_classes:
    event.listen(_, 'before_update', set_last_updated)
    event.listen(_, 'after_update', notify_updated)

for _ in monitor_delete_classes:
    event.listen(_, 'after_delete', notify_deleted)
