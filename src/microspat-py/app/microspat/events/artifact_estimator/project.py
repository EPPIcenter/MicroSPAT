import sqlite3
from datetime import datetime

import sqlalchemy.exc

from app.microspat.schemas import (
    ArtifactEstimatorLocusParamsSchema,
    ArtifactEstimatorProjectSchema,
    ArtifactEquationSchema,
    ArtifactEstimatorSchema,
    DeferredChannelSchema,
    DeferredProjectChannelAnnotationsSchema,
    DeferredProjectSampleAnnotationsSchema,
    DeferredSampleLocusAnnotationSchema,
    LocusArtifactEstimatorSchema,
)

from app.microspat import dict_schemas

from app.microspat.models import (
    ArtifactEquation,
    ArtifactEstimator,
    ArtifactEstimatorProject,
    ArtifactEstimatorLocusParams,
    Channel,
    GenotypingProject,
    LocusArtifactEstimator,
    LocusSet,
    ProjectChannelAnnotations,
    ProjectSampleAnnotations,
    QuantificationBiasEstimatorProject,
    SampleLocusAnnotation,
)

from app.microspat.events.base import (
    base_get_updated,
    base_list,
    extract_ids,
    make_namespace,
    table_to_string_mapping,
    TaskNotifier,
)

from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[ArtifactEstimatorProject]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_NAMESPACE = table_to_string_mapping[ArtifactEstimatorProject]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]
LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[ArtifactEstimatorLocusParams]
LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE = table_to_string_mapping[LocusArtifactEstimator]
ARTIFACT_ESTIMATOR_NAMESPACE = table_to_string_mapping[ArtifactEstimator]
ARTIFACT_EQUATION_NAMESPACE = table_to_string_mapping[ArtifactEquation]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE = table_to_string_mapping[SampleLocusAnnotation]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

project_schema = ArtifactEstimatorProjectSchema()
project_dict_schema = dict_schemas.ArtifactEstimatorProjectSchema()
channel_schema = DeferredChannelSchema(exclude="data")
locus_params_schema = ArtifactEstimatorLocusParamsSchema()
locus_artifact_estimator_schema = LocusArtifactEstimatorSchema()
artifact_estimator_schema = ArtifactEstimatorSchema()
artifact_equation_schema = ArtifactEquationSchema()
project_sample_annotations_schema = DeferredProjectSampleAnnotationsSchema()
sample_locus_annotations_schema = DeferredSampleLocusAnnotationSchema()
project_channel_annotations_schema = DeferredProjectChannelAnnotationsSchema()


socketio.on_event('list', base_list(ArtifactEstimatorProject, project_dict_schema, JSON_NAMESPACE,
                                    query=ArtifactEstimatorProject.get_serialized_list),
                  namespace=SOCK_NAMESPACE)
# socketio.on_event('get_updated',
#                   base_get_updated(ArtifactEstimatorProject, project_schema, project_schema, JSON_NAMESPACE),
#                   namespace=SOCK_NAMESPACE)


# @socketio.on('list', namespace=SOCK_NAMESPACE)
# def list_artifact_estimator_projects():
#     projects = ArtifactEstimatorProject.query.all()
#     artifact_equations = ArtifactEquation.query.all()
#     locus_artifact_estimators = LocusArtifactEstimator.query.all()
#     locus_parameters = ArtifactEstimatorLocusParams.query.all()
#
#     artifact_equations_dump = artifact_equation_schema.dumps(artifact_equations, many=True)
#     socketio.emit('get', {ARTIFACT_EQUATION_NAMESPACE: artifact_equations_dump.data},
#                   namespace=make_namespace(ARTIFACT_EQUATION_NAMESPACE))
#     socketio.sleep()
#
#     locus_artifact_estimators_dump = locus_artifact_estimator_schema.dumps(locus_artifact_estimators, many=True)
#     socketio.emit('get', {LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE: locus_artifact_estimators_dump.data},
#                   namespace=make_namespace(LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE))
#     socketio.sleep()
#
#     locus_params_dump = locus_params_schema.dumps(locus_parameters, many=True)
#     socketio.emit('get', {LOCUS_PARAMS_NAMESPACE: locus_params_dump.data},
#                   namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
#     socketio.sleep()
#
#     project_dump = project_schema.dumps(projects, many=True)
#     socketio.emit('list', {PROJECT_NAMESPACE: project_dump.data},
#                   namespace=make_namespace(PROJECT_NAMESPACE))
#     socketio.sleep()


@socketio.on('get_updated', namespace=SOCK_NAMESPACE)
@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_artifact_estimator_project(json):
    ids = extract_ids(json)
    projects = []
    channels = []
    locus_parameters = []
    locus_artifact_estimators = []
    artifact_estimators = []
    artifact_equations = []
    project_sample_annotations = []
    sample_locus_annotations = []
    project_channel_annotations = []

    for project_id in ids:
        p = ArtifactEstimatorProject.query.get(project_id)
        if p:
            projects.append(p)
            channels += p.get_serialized_channels()
            locus_parameters += p.locus_parameters.all()
            locus_artifact_estimators += LocusArtifactEstimator.query.filter(
                LocusArtifactEstimator.project_id == project_id
            ).all()
            artifact_estimators += ArtifactEstimator.query.join(LocusArtifactEstimator).filter(
                LocusArtifactEstimator.project_id == project_id
            ).all()
            artifact_equations += ArtifactEquation.query.join(ArtifactEstimator).join(LocusArtifactEstimator).filter(
                LocusArtifactEstimator.project_id == project_id
            ).all()
            project_sample_annotations += ProjectSampleAnnotations.get_serialized_list(project_id)
            sample_locus_annotations += SampleLocusAnnotation.get_serialized_list(project_id)
            project_channel_annotations += ProjectChannelAnnotations.get_serialized_list(project_id)
        else:
            socketio.emit('get_failed', {PROJECT_NAMESPACE: [project_id]}, namespace=make_namespace(PROJECT_NAMESPACE))

    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('list', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()

    project_channel_annotations_dump = project_channel_annotations_schema.dumps(project_channel_annotations,
                                                                                many=True)
    socketio.emit('get', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: project_channel_annotations_dump.data},
                  namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))
    socketio.sleep()

    sample_locus_annotations_dump = sample_locus_annotations_schema.dumps(sample_locus_annotations, many=True)
    socketio.emit('get', {SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE: sample_locus_annotations_dump.data},
                  namespace=make_namespace(SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE))
    socketio.sleep()

    project_sample_annotations_dump = project_sample_annotations_schema.dumps(project_sample_annotations, many=True)
    socketio.emit('get', {PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE: project_sample_annotations_dump.data},
                  namespace=make_namespace(PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE))
    socketio.sleep()

    artifact_equations_dump = artifact_equation_schema.dumps(artifact_equations, many=True)
    socketio.emit('get', {ARTIFACT_EQUATION_NAMESPACE: artifact_equations_dump.data},
                  namespace=make_namespace(ARTIFACT_EQUATION_NAMESPACE))
    socketio.sleep()

    artifact_estimators_dump = artifact_estimator_schema.dumps(artifact_estimators, many=True)
    socketio.emit('get', {ARTIFACT_ESTIMATOR_NAMESPACE: artifact_estimators_dump.data},
                  namespace=make_namespace(ARTIFACT_ESTIMATOR_NAMESPACE))
    socketio.sleep()

    locus_artifact_estimators_dump = locus_artifact_estimator_schema.dumps(locus_artifact_estimators, many=True)
    socketio.emit('get',
                  {LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE: locus_artifact_estimators_dump.data},
                  namespace=make_namespace(LOCUS_ARTIFACT_ESTIMATOR_NAMESPACE))
    socketio.sleep()

    locus_params_dump = locus_params_schema.dumps(locus_parameters, many=True)
    socketio.emit('get',
                  {LOCUS_PARAMS_NAMESPACE: locus_params_dump.data},
                  namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
    socketio.sleep()

    project_dump = project_schema.dumps(projects, many=True)
    socketio.emit('get', {PROJECT_NAMESPACE: project_dump.data}, namespace=make_namespace(PROJECT_NAMESPACE))
    socketio.sleep()


@socketio.on('create_project', namespace=SOCK_NAMESPACE)
def create_project(json):
    task = 'create_project'
    title = json.get('title')
    creator = json.get('creator')
    description = json.get('description')
    locus_set_id = json.get('locus_set_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    if not title:
        task_notifier.emit_task_failure(message="Title Invalid.")
        return

    if not locus_set_id:
        task_notifier.emit_task_failure(message="Locus Set Invalid.")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Creating Project {title}...'
    })

    locus_set = LocusSet.query.get(locus_set_id)

    if not locus_set:
        task_notifier.emit_task_failure(message="Locus Set Invalid")
        return

    try:
        artifact_estimator = ArtifactEstimatorProject(title=title, creator=creator, description=description,
                                                      locus_set_id=locus_set_id)
        db.session.add(artifact_estimator)
        db.session.commit()
    except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
        task_notifier.emit_task_failure(message="Title Must Be Unique.")
        db.session.rollback()
        return
    task_notifier.emit_task_success(message=f"{title} Successfully Created.")


@socketio.on('delete_project', namespace=SOCK_NAMESPACE)
def delete_project(json):
    task = 'delete_project'
    project_id = json.get('project_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, project_id=project_id)

    task_notifier.emit_task_start()

    if not project_id:
        task_notifier.emit_task_failure(message="No Project Selected.")
        return

    ref_qbe_projs = QuantificationBiasEstimatorProject.query.filter(
        QuantificationBiasEstimatorProject.artifact_estimator_id == project_id
    ).all()

    ref_genotype_projs = GenotypingProject.query.filter(
        GenotypingProject.artifact_estimator_id == project_id
    ).all()

    ref_projs = ref_qbe_projs + ref_genotype_projs

    if ref_projs:
        task_notifier.emit_task_failure(
            message=f"Cannot Delete. Artifact Estimator Currently in use by {ref_projs[0].title}."
        )
        return

    project = ArtifactEstimatorProject.query.get(project_id)

    if not project:
        task_notifier.emit_task_failure(message="Project no longer exists. Reload Application")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Deleting Project {project.title}...'
    })

    db.session.delete(project)

    task_notifier.emit_task_success("Successfully Deleted Artifact Estimator.")


@socketio.on('add_samples', namespace=SOCK_NAMESPACE)
def add_samples(json):
    task = 'add_samples'
    sample_ids = json.get('sample_ids')
    project_id = json.get('project_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, sample_ids=sample_ids, project_id=project_id)

    task_notifier.emit_task_start()

    if not sample_ids:
        task_notifier.emit_task_failure(message="No Samples Selected.")
        return

    if not project_id:
        task_notifier.emit_task_failure(message="No Project Selected.")
        return

    project = ArtifactEstimatorProject.query.get(project_id)

    if not project:
        task_notifier.emit_task_failure(message="Project no longer exists. Reload Application.")

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': 'Adding Samples...'
    })

    project.add_samples(sample_ids)

    project.last_updated = datetime.utcnow()

    task_notifier.emit_task_success(message="Successfully Added Samples.")


@socketio.on('remove_samples', namespace=SOCK_NAMESPACE)
def remove_samples(json):
    task = 'remove_samples'
    sample_ids = json.get('sample_ids')
    project_id = json.get('project_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, sample_ids=sample_ids, project_id=project_id)

    task_notifier.emit_task_start()

    if not sample_ids:
        task_notifier.emit_task_failure(message="No Samples Selected")
        return

    if not project_id:
        task_notifier.emit_task_failure(message="No Project Selected")
        return

    project = ArtifactEstimatorProject.query.get(project_id)

    if not project:
        task_notifier.emit_task_failure(message="Project no longer exists. Reload Page.")

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': 'Removing Samples...'
    })

    project.remove_samples(sample_ids)

    project.last_updated = datetime.utcnow()

    task_notifier.emit_task_success(message="Successfully Removed Samples.")


@socketio.on('analyze_loci', namespace=SOCK_NAMESPACE)
def analyze_loci(json):
    task = 'analyze_loci'
    locus_parameter_ids = json.get('locus_parameter_ids')
    parameter_settings = json.get('parameter_settings')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE,
                                 locus_parameter_ids=locus_parameter_ids, parameter_settings=parameter_settings)

    task_notifier.emit_task_start()

    if not locus_parameter_ids:
        task_notifier.emit_task_failure(message="No Locus Parameter Selected.")
        return

    lps: list[ArtifactEstimatorLocusParams] = ArtifactEstimatorLocusParams.query.filter(
        ArtifactEstimatorLocusParams.id.in_(locus_parameter_ids)
    ).all()

    if not lps:
        task_notifier.emit_task_failure(message="Locus Parameters No Longer Exist. Reload Application.")
        return

    if parameter_settings:
        for lp in lps:
            for k, v in parameter_settings.items():
                if hasattr(lp, k):
                    if getattr(lp, k) != v:
                        setattr(lp, k, v)
        # db.session.flush()
        socketio.sleep()

    project = lps[0].project
    total_lps = len(lps)

    for idx, lp in enumerate(lps):
        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': total_lps,
            'current_state': idx + 1,
            'message': f'Analyzing {lp.locus.label}...'
        })
        project.analyze_locus(lp.locus_id)
        socketio.sleep()

    project.last_updated = datetime.utcnow()

    task_notifier.emit_task_success("Successfully Analyzed All Loci")


@socketio.on('add_breakpoint', namespace=SOCK_NAMESPACE)
def add_breakpoint(json):
    task = 'add_breakpoint'
    artifact_estimator_id = json.get('id')
    base_size = json.get('base_size')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE,
                                 artifact_estimator_id=artifact_estimator_id, base_size=base_size)

    task_notifier.emit_task_start()

    if not artifact_estimator_id:
        task_notifier.emit_task_failure(message="No Artifact Estimator Selected")
        return

    if not base_size:
        task_notifier.emit_task_failure(message="No Base Size Submitted")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Adding New Breakpoint...'
    })

    ae = ArtifactEstimator.query.get(artifact_estimator_id)

    ae.add_breakpoint(base_size)

    db.session.commit()

    task_notifier.emit_task_success("Successfully Added Breakpoint")


@socketio.on('delete_artifact_estimator', namespace=SOCK_NAMESPACE)
def delete_artifact_estimator(json):
    task = 'delete_artifact_estimator'
    artifact_estimator_id = json.get('id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE,
                                 artifact_estimator_id=artifact_estimator_id)

    task_notifier.emit_task_start()

    if not artifact_estimator_id:
        task_notifier.emit_task_failure(message="No Artifact Estimator Selected")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Deleting Artifact Estimator...'
    })

    ae = ArtifactEstimator.query.get(artifact_estimator_id)

    db.session.delete(ae)

    db.session.commit()

    task_notifier.emit_task_success("Successfully Deleted Artifact Estimator")


@socketio.on('clear_breakpoints', namespace=SOCK_NAMESPACE)
def clear_breakpoints(json):
    task = 'clear_breakpoints'
    artifact_estimator_id = json.get('id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE,
                                 artifact_estimator_id=artifact_estimator_id)

    task_notifier.emit_task_start()

    if not artifact_estimator_id:
        task_notifier.emit_task_failure(message="No Artifact Estimator Selected")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Clearing Breakpoints...'
    })

    ae = ArtifactEstimator.query.get(artifact_estimator_id)

    ae.clear_breakpoints()

    db.session.commit()

    task_notifier.emit_task_success("Successfully Cleared Breakpoints")


@socketio.on('recalculate_equation', namespace=SOCK_NAMESPACE)
def recalculate_equation(json):
    task = 'recalculate_equation'

    artifact_equation_id = json.get('id')

    method = json.get('method')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE,
                                 artifact_equation_id=artifact_equation_id, method=method)

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Recalculating Equation...'
    })

    artifact_eqn = ArtifactEquation.query.get(artifact_equation_id)
    artifact_estimator = artifact_eqn.artifact_estimator

    param_sets = [{
        'start_size': eq.start_size,
        'end_size': eq.end_size,
        'method': method if eq.id == artifact_equation_id else eq.method
    } for eq in artifact_estimator.artifact_equations]

    artifact_estimator.generate_estimating_equations(param_sets)

    db.session.commit()

    task_notifier.emit_task_success("Successfully Recalculated Equation")
