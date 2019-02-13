import sqlite3
from datetime import datetime

import sqlalchemy.exc

from app.microspat import dict_schemas
from app.microspat.schemas import (
    BinEstimatorLocusParamsSchema,
    BinEstimatorProjectSchema,
    BinSchema,
    DeferredChannelSchema,
    DeferredProjectChannelAnnotationsSchema,
    DeferredProjectSampleAnnotationsSchema,
    DeferredSampleLocusAnnotationSchema,
    LocusBinSetSchema,
)

from app.microspat.models import (
    Bin,
    BinEstimatorLocusParams,
    BinEstimatorProject,
    Channel,
    GenotypingProject,
    LocusBinSet,
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

JSON_NAMESPACE = table_to_string_mapping[BinEstimatorProject]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_NAMESPACE = table_to_string_mapping[BinEstimatorProject]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]
LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[BinEstimatorLocusParams]
LOCUS_BIN_SET_NAMESPACE = table_to_string_mapping[LocusBinSet]
BIN_NAMESPACE = table_to_string_mapping[Bin]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE = table_to_string_mapping[SampleLocusAnnotation]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

project_schema = BinEstimatorProjectSchema()
project_dict_schema = dict_schemas.BinEstimatorProjectSchema()
channel_schema = DeferredChannelSchema(exclude="data")
locus_params_schema = BinEstimatorLocusParamsSchema()
locus_bin_set_schema = LocusBinSetSchema()
bin_schema = BinSchema()
project_sample_annotations_schema = DeferredProjectSampleAnnotationsSchema()
sample_locus_annotations_schema = DeferredSampleLocusAnnotationSchema()
project_channel_annotations_schema = DeferredProjectChannelAnnotationsSchema()

socketio.on_event('list', base_list(BinEstimatorProject, project_dict_schema, JSON_NAMESPACE,
                                    query=BinEstimatorProject.get_serialized_list),
                  namespace=SOCK_NAMESPACE)
# socketio.on_event('get_updated', base_get_updated(BinEstimatorProject, project_schema, project_schema, JSON_NAMESPACE),
#                   namespace=SOCK_NAMESPACE)


# @socketio.on('list', namespace=SOCK_NAMESPACE)
# def list_bin_estimator_projects():
#     projects = BinEstimatorProject.query.all()
#     bins = Bin.query.all()
#     locus_bin_sets = LocusBinSet.query.all()
#     locus_parameters = BinEstimatorLocusParams.query.all()
#     bins_dump = bin_schema.dumps(bins, many=True)
#     socketio.emit('get', {BIN_NAMESPACE: bins_dump.data}, namespace=make_namespace(BIN_NAMESPACE))
#     socketio.sleep()
#
#     locus_bin_sets_dump = locus_bin_set_schema.dumps(locus_bin_sets, many=True)
#     socketio.emit('get', {LOCUS_BIN_SET_NAMESPACE: locus_bin_sets_dump.data},
#                   namespace=make_namespace(LOCUS_BIN_SET_NAMESPACE))
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
def get_bin_estimator_project(json):
    ids = extract_ids(json)
    projects = []
    channels = []
    locus_parameters = []
    locus_bin_sets = []
    bins = []
    project_sample_annotations = []
    sample_locus_annotations = []
    project_channel_annotations = []
    for project_id in set(ids):
        p = BinEstimatorProject.query.get(project_id)
        socketio.sleep()

        if p:
            projects.append(p)
            channels += Channel.get_serialized_list(project_id)
            socketio.sleep()

            locus_parameters += BinEstimatorLocusParams.query \
                .filter(BinEstimatorLocusParams.project_id == project_id) \
                .all()
            socketio.sleep()

            locus_bin_sets += LocusBinSet.query.filter(LocusBinSet.project_id == project_id).all()
            socketio.sleep()

            bins += Bin.query.join(LocusBinSet).filter(LocusBinSet.project_id == project_id).all()
            socketio.sleep()

            project_sample_annotations += ProjectSampleAnnotations.get_serialized_list(project_id)
            socketio.sleep()

            sample_locus_annotations += SampleLocusAnnotation.get_serialized_list(project_id)
            socketio.sleep()

            project_channel_annotations += ProjectChannelAnnotations.get_serialized_list(project_id)
            socketio.sleep()

        else:
            socketio.emit('get_failed', {PROJECT_NAMESPACE: [project_id]}, namespace=make_namespace(PROJECT_NAMESPACE))

    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('list', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()
    project_channel_annotations_dump = project_channel_annotations_schema.dumps(project_channel_annotations, many=True)
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

    bins_dump = bin_schema.dumps(bins, many=True)
    socketio.emit('get', {BIN_NAMESPACE: bins_dump.data}, namespace=make_namespace(BIN_NAMESPACE))
    socketio.sleep()

    locus_bin_sets_dump = locus_bin_set_schema.dumps(locus_bin_sets, many=True)
    socketio.emit('get', {LOCUS_BIN_SET_NAMESPACE: locus_bin_sets_dump.data},
                  namespace=make_namespace(LOCUS_BIN_SET_NAMESPACE))
    socketio.sleep()

    locus_params_dump = locus_params_schema.dumps(locus_parameters, many=True)
    socketio.emit('get', {LOCUS_PARAMS_NAMESPACE: locus_params_dump.data},
                  namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
    socketio.sleep()

    project_dump = project_schema.dumps(projects, many=True)
    socketio.emit('get', {PROJECT_NAMESPACE: project_dump.data},
                  namespace=make_namespace(PROJECT_NAMESPACE))
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
        bin_estimator = BinEstimatorProject(title=title, creator=creator, description=description,
                                            locus_set_id=locus_set_id)
        db.session.add(bin_estimator)
        socketio.sleep()

        db.session.commit()
        socketio.sleep()

    except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
        task_notifier.emit_task_failure(message="Title Must Be Unique.")
        db.session.rollback()
        return
    socketio.sleep()

    task_notifier.emit_task_success(message="{title} Successfully Created.")


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
        QuantificationBiasEstimatorProject.bin_estimator_id == project_id
    ).all()

    ref_genotype_projs = GenotypingProject.query.filter(
        GenotypingProject.bin_estimator_id == project_id
    ).all()

    ref_projs = ref_qbe_projs + ref_genotype_projs

    if ref_projs:
        task_notifier.emit_task_failure(
            message=f"Cannot Delete. Bin Estimator Currently in use by {ref_projs[0].title}."
        )
        return

    project = BinEstimatorProject.query.get(project_id)

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
    db.session.commit()

    task_notifier.emit_task_success("Successfully Deleted Bin Estimator.")


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

    project = BinEstimatorProject.query.get(project_id)
    socketio.sleep()

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

    # db.session.commit()

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

    project = BinEstimatorProject.query.get(project_id)

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


def ack():
    print("Analyze Locus Update Acknowledged")


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
    lps = []
    for id in locus_parameter_ids:
        lp = BinEstimatorLocusParams.query.get(id)
        lps.append(lp)
    # lps = BinEstimatorLocusParams.query.filter(
    #     BinEstimatorLocusParams.id.in_(locus_parameter_ids)
    # ).all()

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
        }, callback=ack)
        socketio.sleep()
        project.analyze_locus(lp.locus_id)
        socketio.sleep()

    project.last_updated = datetime.utcnow()

    task_notifier.emit_task_success("Successfully Analyzed All Loci", callback=lambda: print("Success Acknowledged"))
