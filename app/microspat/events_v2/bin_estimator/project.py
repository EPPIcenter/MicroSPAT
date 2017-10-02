from flask_socketio import send
import eventlet

from app.microspat.schemas import BinEstimatorProjectSchema, BinEstimatorLocusParamsSchema, LocusBinSetSchema,\
    BinSchema, ProjectSampleAnnotationsSchema, SampleLocusAnnotationSchema, ProjectChannelAnnotationsSchema
from app.microspat.models import BinEstimatorProject, BinEstimatorLocusParams, LocusBinSet, Bin, \
    ProjectSampleAnnotations, SampleLocusAnnotation, ProjectChannelAnnotations
from ..base import base_list, extract_ids, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[BinEstimatorProject]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_NAMESPACE = table_to_string_mapping[BinEstimatorProject]
LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[BinEstimatorLocusParams]
LOCUS_BIN_SET_NAMESPACE = table_to_string_mapping[LocusBinSet]
BIN_NAMESPACE = table_to_string_mapping[Bin]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE = table_to_string_mapping[SampleLocusAnnotation]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

project_schema = BinEstimatorProjectSchema()
locus_params_schema = BinEstimatorLocusParamsSchema()
locus_bin_set_schema = LocusBinSetSchema()
bin_schema = BinSchema()
project_sample_annotations_schema = ProjectSampleAnnotationsSchema()
sample_locus_annotations_schema = SampleLocusAnnotationSchema()
project_channel_annotations_schema = ProjectChannelAnnotationsSchema()


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_bin_estimator_project(json):
    ids = extract_ids(json)

    for project_id in ids:
        p = BinEstimatorProject.query.get(project_id)
        if p:
            project_dump = project_schema.dumps([p], many=True)
            socketio.emit('get', {PROJECT_NAMESPACE: project_dump.data}, namespace=PROJECT_NAMESPACE)
            eventlet.sleep()

            locus_params = p.locus_parameters.all()
            locus_params_dump = locus_params_schema.dumps(locus_params, many=True)
            socketio.emit('get',
                          {LOCUS_PARAMS_NAMESPACE, locus_params_dump.data},
                          namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
            eventlet.sleep()

            locus_bin_sets = LocusBinSet.query\
                .filter(LocusBinSet.project_id == project_id).all()
            locus_bin_sets_dump = locus_bin_set_schema.dumps(locus_bin_sets, many=True)
            socketio.emit('get', {LOCUS_BIN_SET_NAMESPACE: locus_bin_sets_dump.data},
                          namespace=make_namespace(LOCUS_BIN_SET_NAMESPACE))

            bins = Bin.query.join(LocusBinSet)\
                .filter(LocusBinSet.project_id == project_id).all()
            bins_dump = bin_schema.dumps(bins, many=True)
            socketio.emit('get', {BIN_NAMESPACE: bins_dump.data}, namespace=make_namespace(BIN_NAMESPACE))
            eventlet.sleep()

            project_sample_annotations = ProjectSampleAnnotations.query \
                .filter(ProjectSampleAnnotations.project_id == project_id).all()
            project_sample_annotations_dump = project_sample_annotations_schema.dumps(project_sample_annotations, many=True)
            socketio.emit('get', {PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE: project_sample_annotations_dump.data},
                          namespace=make_namespace(PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE))
            eventlet.sleep()

            sample_locus_annotations = SampleLocusAnnotation.query \
                .filter(SampleLocusAnnotation.project_id == project_id).all()
            sample_locus_annotations_dump = sample_locus_annotations_schema.dumps(sample_locus_annotations, many=True)
            socketio.emit('get', {SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE: sample_locus_annotations_dump.data},
                          namespace=make_namespace(SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE))
            eventlet.sleep()

            project_channel_annotations = ProjectChannelAnnotations.query \
                .filter(ProjectChannelAnnotations.project_id == project_id).all()
            project_channel_annotations_dump = project_channel_annotations_schema.dumps(project_channel_annotations,
                                                                                        many=True)
            socketio.emit('get', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: project_channel_annotations_dump.data},
                          namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))
            eventlet.sleep()


socketio.on_event('list', base_list(BinEstimatorProject, project_schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)
