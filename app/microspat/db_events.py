from collections import defaultdict

from flask_sqlalchemy import SignallingSession
from sqlalchemy import event
from sqlalchemy.engine import Engine

from app import socketio
from app.microspat.events_v2 import make_namespace
from app.microspat.events_v2.base import table_to_string_mapping
from app.microspat.schemas import *


@event.listens_for(SignallingSession, 'before_flush')
def clear_channel_annotations(session, _, __):
    channel_annotation_ids = [_.id for _ in db.session.deleted if isinstance(_, ProjectChannelAnnotations)]
    if channel_annotation_ids:
        annotations = SampleLocusAnnotation.query.filter(
            SampleLocusAnnotation.reference_run_id.in_(channel_annotation_ids)).all()
        for a in annotations:
            assert isinstance(a, SampleLocusAnnotation)
            a.clear_annotated_peaks()
            a.clear_alleles()
            a.clear_flags()


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if db.engine.url.drivername == 'sqlite':
        cursor = dbapi_connection.cursor()
        # cursor.execute("VACUUM")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA cache_size=-1000000")
        cursor.close()


@event.listens_for(SignallingSession, 'after_flush')
def notify_locus_parameter_locked(session, _):
    locus_parameter_subsets = defaultdict(list)
    for target in db.session.dirty:
        if isinstance(target, ProjectLocusParams):
            locus_parameter_subsets[table_to_string_mapping[target.__class__]].append((target.id, target.locked))
    for subset_label in locus_parameter_subsets:
        locus_parameters = locus_parameter_subsets[subset_label]
        socketio.emit('locked', locus_parameters, namespace=make_namespace(subset_label), broadcast=True)


def notify_updated(_, __, target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]
    print "Updating class {} with id {}".format(string_mapping, str(target.id))
    socketio.emit('updated', {
        'id': str(target.id)
    }, namespace=make_namespace(string_mapping), broadcast=True)


def notify_deleted(_, __, target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]
    print "Deleting class {} with id {}".format(string_mapping, str(target.id))
    socketio.emit('deleted', {
        'id': str(target.id)
    }, namespace=make_namespace(string_mapping), broadcast=True)


def notify_created(_, __, target):
    target_class = target.__class__
    string_mapping = table_to_string_mapping[target_class]
    print "Inserting class {} with id {}".format(string_mapping, str(target.id))
    socketio.emit('created', {
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
    event.listen(_, 'after_update', notify_updated)

for _ in monitor_delete_classes:
    event.listen(_, 'after_delete', notify_deleted)
