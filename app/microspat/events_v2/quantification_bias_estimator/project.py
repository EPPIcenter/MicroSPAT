from flask_socketio import send
import eventlet

from app.microspat.schemas import QuantificationBiasEstimatorProjectSchema,\
    QuantificationBiasEstimatorLocusParamsSchema, ControlSampleAssociationSchema, ProjectSampleAnnotationsSchema,\
    SampleLocusAnnotationSchema, ProjectChannelAnnotationsSchema
from app.microspat.models import QuantificationBiasEstimatorProject, QuantificationBiasEstimatorLocusParams,\
    ControlSampleAssociation, ProjectSampleAnnotations, SampleLocusAnnotation, ProjectChannelAnnotations
from ..base import base_list, extract_ids, table_to_string_mapping, make_namespace
from app import socketio

PROJECT_NAMESPACE = table_to_string_mapping[QuantificationBiasEstimatorProject]
PROJECT_SOCK_NAMESPACE= make_namespace(PROJECT_NAMESPACE)

LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[QuantificationBiasEstimatorLocusParams]
CONTROL_SAMPLE_ASSOCIATION_NAMESPACE = table_to_string_mapping[ControlSampleAssociation]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE = table_to_string_mapping[SampleLocusAnnotation]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

project_schema = QuantificationBiasEstimatorProjectSchema()
locus_params_schema = QuantificationBiasEstimatorLocusParamsSchema()
control_sample_association_schema = ControlSampleAssociationSchema()
project_sample_annotations_schema = ProjectSampleAnnotationsSchema()
sample_locus_annotations_schema = SampleLocusAnnotationSchema()
project_channel_annotations_schema = ProjectChannelAnnotationsSchema()


@socketio.on('get', namespace=PROJECT_SOCK_NAMESPACE)
def get_quantification_bias_estimator_project(json):
    ids = extract_ids(json)

    for project_id in ids:
        p = QuantificationBiasEstimatorProject.query.get(p)
        if p:
            project_dump = project_schema.dumps([p], many=True)
            socketio.emit('get', {PROJECT_NAMESPACE: project_dump.data}, namespace=PROJECT_SOCK_NAMESPACE)
            eventlet.sleep()

            locus_params = p.locus_parameters.all()
            locus_params_dump = locus_params_schema.dumps(locus_params, many=True)
            socketio.emit('get',
                          {LOCUS_PARAMS_NAMESPACE, locus_params_dump.data},
                          namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
            eventlet.sleep()

            control_sample_associations = ControlSampleAssociation.query\
                .join(ProjectSampleAnnotationsSchema).filter(ProjectSampleAnnotations.project_id == project_id).all()
            control_sample_associations_dump = control_sample_association_schema.dumps(control_sample_associations,
                                                                                       many=True)
            socketio.emit('get', {CONTROL_SAMPLE_ASSOCIATION_NAMESPACE: control_sample_associations_dump.data},
                          namespace=make_namespace(CONTROL_SAMPLE_ASSOCIATION_NAMESPACE))

            project_sample_annotations = ProjectSampleAnnotations.query \
                .filter(ProjectSampleAnnotations.project_id == project_id).all()
            project_sample_annotations_dump = project_sample_annotations_schema.dumps(project_sample_annotations,
                                                                                      many=True)
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


socketio.on_event('list', base_list(QuantificationBiasEstimatorProject, project_schema, PROJECT_NAMESPACE),
                  namespace=PROJECT_SOCK_NAMESPACE)
