from collections import defaultdict
from datetime import datetime

from flask_sqlalchemy import SignallingSession
from marshmallow import fields, Schema
from sqlalchemy import event
from sqlalchemy.engine import Engine

from app import socketio, db

from app.microspat.events import make_namespace
from app.microspat.events.base import table_to_string_mapping
from app.microspat.models import *


bidirectional_relationships = {
    # Sample: ['channels'],
    # Channel: ['sample', 'annotations'],
    # Well: ['channels'],
    # ProjectSampleAnnotations: ['project']
}

parent_relationships = {
    Bin: ['locus_bin_set'],
    ArtifactEquation: ['artifact_estimator'],
    ProjectSampleAnnotations: ['project'],
    # Genotype: ['project'],
    ProjectChannelAnnotations: ['project', 'channel']
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
        cursor.execute("PRAGMA cache_size=-10000000")
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


def _notify_object_updated(target, ignore_classes=None):
    if not ignore_classes:
        ignore_classes = set()
    target_class = target.__class__
    target.last_updated = datetime.utcnow()
    string_mapping = table_to_string_mapping[target_class]


    # for attr in bidirectional_relationships.get(target_class, []):
    #     related_objs = getattr(target, attr)
    #     try:
    #         _related_objs = related_objs.all()
    #         related_objs = _related_objs
    #     except AttributeError:
    #         continue
    #
    #     if related_objs:
    #         print("Updating Related objs", related_objs)
    #         try:
    #             for obj in related_objs:
    #                 if obj.__class__ not in ignore_classes:
    #                     ignore_classes.add(target_class)
    #                     _notify_object_updated(obj, ignore_classes)
    #
    #         except TypeError:
    #             if related_objs.__class__ not in ignore_classes:
    #                 ignore_classes.add(target_class)
    #                 _notify_object_updated(related_objs, ignore_classes)

    socketio.emit('updated', update_msg_schema.dump({
        'last_updated': target.last_updated,
        'model': string_mapping,
        'id': str(target.id)
    }), namespace=make_namespace(string_mapping), broadcast=True)


def notify_deleted(_, __, target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]
    # print("Deleting class {} with id {}".format(string_mapping, str(target.id)))

    # for attr in bidirectional_relationships.get(target_class, []):
    #     related_objs = getattr(target, attr)
    #     try:
    #         for obj in related_objs:
    #             _notify_object_updated(obj)
    #     except TypeError:
    #         _notify_object_updated(related_objs)

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


def notify_parent_updated(_, __, target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]
    # print(f"Updating Parent Classes of {string_mapping} with id {target.id}")
    for attr in parent_relationships.get(target_class, []):
        related_objs = getattr(target, attr)
        if related_objs:
            try:
                for obj in related_objs:
                    _notify_object_updated(obj)
            except TypeError:
                _notify_object_updated(related_objs)


monitor_create_classes = (
    ArtifactEquation,
    ArtifactEstimator,
    ArtifactEstimatorLocusParams,
    ArtifactEstimatorProject,
    Bin,
    BinEstimatorLocusParams,
    BinEstimatorProject,
    # Channel,
    Control,
    ControlSampleAssociation,
    Genotype,
    GenotypingLocusParams,
    GenotypingProject,
    Ladder,
    Locus,
    LocusArtifactEstimator,
    LocusBinSet,
    LocusSet,
    Plate,
    ProjectChannelAnnotations,
    ProjectSampleAnnotations,
    QuantificationBiasEstimatorLocusParams,
    QuantificationBiasEstimatorProject,
    Sample,
    SampleLocusAnnotation,
    # Well
)

monitor_update_classes = (
    ArtifactEquation,
    ArtifactEstimator,
    ArtifactEstimatorLocusParams,
    ArtifactEstimatorProject,
    Bin,
    BinEstimatorLocusParams,
    BinEstimatorProject,
    Channel,
    Control,
    ControlSampleAssociation,
    Genotype,
    GenotypingLocusParams,
    GenotypingProject,
    Ladder,
    Locus,
    LocusArtifactEstimator,
    LocusBinSet,
    LocusSet,
    Plate,
    ProjectChannelAnnotations,
    ProjectSampleAnnotations,
    QuantificationBiasEstimatorLocusParams,
    QuantificationBiasEstimatorProject,
    Sample,
    SampleLocusAnnotation,
    Well
)

monitor_delete_classes = (
    ArtifactEquation,
    ArtifactEstimator,
    ArtifactEstimatorLocusParams,
    ArtifactEstimatorProject,
    Bin,
    BinEstimatorLocusParams,
    BinEstimatorProject,
    Channel,
    Control,
    ControlSampleAssociation,
    Genotype,
    GenotypingLocusParams,
    GenotypingProject,
    Ladder,
    Locus,
    LocusArtifactEstimator,
    LocusBinSet,
    LocusSet,
    Plate,
    ProjectChannelAnnotations,
    ProjectSampleAnnotations,
    QuantificationBiasEstimatorLocusParams,
    QuantificationBiasEstimatorProject,
    Sample,
    SampleLocusAnnotation,
    Well
)

for _ in monitor_create_classes:
    event.listen(_, 'after_insert', notify_parent_updated)
    event.listen(_, 'after_insert', notify_created)

for _ in monitor_update_classes:
    event.listen(_, 'before_update', set_last_updated)
    event.listen(_, 'after_update', notify_updated)

for _ in monitor_delete_classes:
    event.listen(_, 'after_delete', notify_parent_updated)
    event.listen(_, 'after_delete', notify_deleted)
