from flask_socketio import send
import eventlet

from app.microspat.schemas import ArtifactEstimatorProjectSchema, ArtifactEstimatorLocusParamsSchema, \
    LocusArtifactEstimatorSchema, ArtifactEstimatorSchema, ArtifactEquationSchema, ProjectSampleAnnotationsSchema,\
    SampleLocusAnnotationSchema, ProjectChannelAnnotationsSchema
from app.microspat.models import ArtifactEstimatorProject, ArtifactEstimatorLocusParams,\
    LocusArtifactEstimator, ArtifactEstimator, ArtifactEquation, ProjectSampleAnnotations, SampleLocusAnnotation,\
    ProjectChannelAnnotations
from ..base import base_list, extract_ids, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[ArtifactEstimatorProject]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_NAMESPACE = table_to_string_mapping[ArtifactEstimatorProject]
LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[ArtifactEstimatorLocusParams]
LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE = table_to_string_mapping[LocusArtifactEstimator]
ARTIFACT_ESTIMATOR_NAMESPACE = table_to_string_mapping[ArtifactEstimator]
ARTIFACT_EQUATION_NAMESPACE = table_to_string_mapping[ArtifactEquation]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE = table_to_string_mapping[SampleLocusAnnotation]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

project_schema = ArtifactEstimatorProjectSchema()
locus_params_schema = ArtifactEstimatorLocusParamsSchema()
locus_artifact_estimator_schema = LocusArtifactEstimatorSchema()
artifact_estimator_schema = ArtifactEstimatorSchema()
artifact_equation_schema = ArtifactEquationSchema()
project_sample_annotations_schema = ProjectSampleAnnotationsSchema()
sample_locus_annotations_schema = SampleLocusAnnotationSchema()
project_channel_annotations_schema = ProjectChannelAnnotationsSchema()


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_artifact_estimator_project(json):
    ids = extract_ids(json)

    for project_id in ids:
        p = ArtifactEstimatorProject.query.get(project_id)
        if p:
            project_dump = project_schema.dumps([p], many=True)
            socketio.emit('get', {PROJECT_NAMESPACE: project_dump.data}, namespace=make_namespace(PROJECT_NAMESPACE))
            eventlet.sleep()

            locus_params = p.locus_parameters.all()
            locus_params_dump = locus_params_schema.dumps(locus_params, many=True)
            socketio.emit('get',
                          {LOCUS_PARAMS_NAMESPACE, locus_params_dump.data},
                          namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
            eventlet.sleep()

            locus_artifact_estimators = LocusArtifactEstimator.query\
                .filter(LocusArtifactEstimator.project_id == project_id).all()
            locus_artifact_estimators_dump = locus_artifact_estimator_schema.dumps(locus_artifact_estimators, many=True)
            socketio.emit('get',
                          {LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE: locus_artifact_estimators_dump.data},
                          namespace=make_namespace(LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE))
            eventlet.sleep()

            artifact_estimators = ArtifactEstimator.query\
                .join(LocusArtifactEstimator)\
                .filter(LocusArtifactEstimator.project_id == project_id)\
                .all()
            artifact_estimators_dump = artifact_estimator_schema.dumps(artifact_estimators, many=True)
            socketio.emit('get', {ARTIFACT_ESTIMATOR_NAMESPACE: artifact_estimators_dump.data},
                          namespace=make_namespace(ARTIFACT_ESTIMATOR_NAMESPACE))
            eventlet.sleep()

            artifact_equations = ArtifactEquation.query\
                .join(ArtifactEstimator)\
                .join(LocusArtifactEstimator)\
                .join(ArtifactEstimatorProject)\
                .filter(ArtifactEstimatorProject.id == project_id).all()
            artifact_equations_dump = artifact_equation_schema.dumps(artifact_equations, many=True)
            socketio.emit('get', {ARTIFACT_EQUATION_NAMESPACE: artifact_equations_dump.data},
                          namespace=make_namespace(ARTIFACT_EQUATION_NAMESPACE))
            eventlet.sleep()

            project_sample_annotations = ProjectSampleAnnotations.query\
                .filter(ProjectSampleAnnotations.project_id == project_id).all()
            project_sample_annotations_dump = project_sample_annotations_schema.dumps(project_sample_annotations, many=True)
            socketio.emit('get', {PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE: project_sample_annotations_dump.data},
                          namespace=make_namespace(PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE))
            eventlet.sleep()

            sample_locus_annotations = SampleLocusAnnotation.query\
                .filter(SampleLocusAnnotation.project_id == project_id).all()
            sample_locus_annotations_dump = sample_locus_annotations_schema.dumps(sample_locus_annotations, many=True)
            socketio.emit('get', {SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE: sample_locus_annotations_dump.data},
                          namespace=make_namespace(SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE))
            eventlet.sleep()

            project_channel_annotations = ProjectChannelAnnotations.query\
                .filter(ProjectChannelAnnotations.project_id == project_id).all()
            project_channel_annotations_dump = project_channel_annotations_schema.dumps(project_channel_annotations,
                                                                                        many=True)
            socketio.emit('get', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: project_channel_annotations_dump.data},
                          namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))
            eventlet.sleep()


# @socketio.on('list', namespace='/' + PROJECT_NAMESPACE)
# def list_artifact_estimator_projects():
#     projects = ArtifactEstimatorProject.query.all()
#     dump = project_schema.dumps(projects, many=True)
#     res = {
#         'artifact_estimator_project': dump.data
#     }
#     send(res)

socketio.on_event('list', base_list(ArtifactEstimatorProject, project_schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
