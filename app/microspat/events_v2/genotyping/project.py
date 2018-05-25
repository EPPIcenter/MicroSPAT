import eventlet

from app.microspat.schemas import GenotypingProjectSchema, GenotypingLocusParamsSchema, ProjectSampleAnnotationsSchema,\
    GenotypeSchema, ProjectChannelAnnotationsSchema
from app.microspat.models import GenotypingProject, GenotypingLocusParams, ProjectSampleAnnotations, Genotype,\
    ProjectChannelAnnotations
from ..base import base_list, extract_ids, table_to_string_mapping, make_namespace
from app import socketio

JSON_NAMESPACE = table_to_string_mapping[GenotypingProject]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_NAMESPACE = table_to_string_mapping[GenotypingProject]
LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[GenotypingLocusParams]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
GENOTYPE_NAMESPACE = table_to_string_mapping[Genotype]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

project_schema = GenotypingProjectSchema()
locus_params_schema = GenotypingLocusParamsSchema()
project_sample_annotations_schema = ProjectSampleAnnotationsSchema()
genotype_schema = GenotypeSchema()
project_channel_annotations_schema = ProjectChannelAnnotationsSchema()


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_genotyping_project(json):
    ids = extract_ids(json)

    for project_id in ids:
        p = GenotypingProject.query.get(project_id)
        if p:
            project_dump = project_schema.dumps([p], many=True)
            socketio.emit('get', {PROJECT_NAMESPACE: project_dump.data}, namespace=make_namespace(PROJECT_NAMESPACE))
            eventlet.sleep()

            locus_params = GenotypingLocusParams.query\
                .filter(GenotypingLocusParams.project_id == project_id).all()
            locus_params_dump = locus_params_schema.dumps(locus_params, many=True)
            socketio.emit('get', {LOCUS_PARAMS_NAMESPACE: locus_params_dump.data},
                          namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
            eventlet.sleep()

            project_sample_annotations = ProjectSampleAnnotations.query\
                .filter(ProjectChannelAnnotations.project_id == project_id).all()
            project_sample_annotations_dump = project_sample_annotations_schema.dumps(project_sample_annotations,
                                                                                      many=True)
            socketio.emit('get', {PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE: project_sample_annotations_dump.data},
                          namespace=make_namespace(PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE))
            eventlet.sleep()

            genotypes = Genotype.query.filter(Genotype.project_id == project_id).all()
            genotypes_dump = genotype_schema.dumps(genotypes, many=True)
            socketio.emit('get', {GENOTYPE_NAMESPACE: genotypes_dump.data},
                          namespace=make_namespace(GENOTYPE_NAMESPACE))
            eventlet.sleep()

            project_channel_annotations = ProjectChannelAnnotations.query\
                .filter(ProjectChannelAnnotations.project_id == project_id).all()
            project_channel_annotations_dump = project_channel_annotations_schema.dumps(project_channel_annotations,
                                                                                        many=True)
            socketio.emit('get', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: project_channel_annotations_dump.data},
                          namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))


socketio.on_event('list', base_list(GenotypingProject, project_schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)
