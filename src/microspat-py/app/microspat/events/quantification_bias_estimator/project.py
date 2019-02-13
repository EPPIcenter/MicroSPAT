import io
import sqlite3

from flask import request, jsonify, copy_current_request_context
import sqlalchemy.exc
from sqlalchemy.orm.exc import NoResultFound

from app.microspat import dict_schemas
from app.microspat.api import microspat_api
from app.microspat.models.quantification_bias_estimator.exceptions import BadProportions

from app.microspat.schemas import (
    DeferredControlSampleAssociationSchema,
    DeferredChannelSchema,
    DeferredProjectChannelAnnotationsSchema,
    DeferredProjectSampleAnnotationsSchema,
    DeferredSampleLocusAnnotationSchema,
    QuantificationBiasEstimatorLocusParamsSchema,
    QuantificationBiasEstimatorProjectSchema,
)

from app.microspat.models import (
    ArtifactEstimatorProject,
    BinEstimatorProject,
    Channel,
    Control,
    ControlSampleAssociation,
    GenotypingProject,
    LocusSet,
    ProjectChannelAnnotations,
    ProjectSampleAnnotations,
    QuantificationBiasEstimatorLocusParams,
    QuantificationBiasEstimatorProject,
    Sample,
    SampleLocusAnnotation,
)

from app.microspat.events.base import (
    base_get_updated,
    base_list,
    extract_ids,
    make_namespace,
    table_to_string_mapping,
    TaskNotifier
)

from app import socketio, db
from app.utils import CaseInsensitiveDictReader

JSON_NAMESPACE = table_to_string_mapping[QuantificationBiasEstimatorProject]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_NAMESPACE = table_to_string_mapping[QuantificationBiasEstimatorProject]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]
LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[QuantificationBiasEstimatorLocusParams]
CONTROL_SAMPLE_ASSOCIATION_NAMESPACE = table_to_string_mapping[ControlSampleAssociation]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
SAMPLE_LOCUS_ANNOTATIONS_NAMESPACE = table_to_string_mapping[SampleLocusAnnotation]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

project_schema = QuantificationBiasEstimatorProjectSchema()
project_dict_schema = dict_schemas.QuantificationBiasEstimatorProjectSchema()
channel_schema = DeferredChannelSchema(exclude="data")
locus_params_schema = QuantificationBiasEstimatorLocusParamsSchema()
control_sample_association_schema = DeferredControlSampleAssociationSchema()
project_sample_annotations_schema = DeferredProjectSampleAnnotationsSchema()
sample_locus_annotations_schema = DeferredSampleLocusAnnotationSchema()
project_channel_annotations_schema = DeferredProjectChannelAnnotationsSchema()

socketio.on_event('list', base_list(QuantificationBiasEstimatorProject, project_dict_schema, JSON_NAMESPACE,
                                    query=QuantificationBiasEstimatorProject.get_serialized_list),
                  namespace=SOCK_NAMESPACE)
socketio.on_event('get_updated', base_get_updated(QuantificationBiasEstimatorProject, project_schema, project_schema,
                                                  JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_quantification_bias_estimator_project(json):
    ids = extract_ids(json)
    projects = []
    channels = []
    locus_parameters = []
    control_sample_associations = []
    project_sample_annotations = []

    for project_id in ids:
        p = QuantificationBiasEstimatorProject.query.get(project_id)
        if p:
            projects.append(p)
            channels += Channel.get_serialized_list(project_id)
            locus_parameters += p.locus_parameters.all()
            control_sample_associations += ControlSampleAssociation.get_serialized_list(project_id)
            project_sample_annotations += ProjectSampleAnnotations.get_serialized_list(project_id)
        else:
            socketio.emit('get_failed', {PROJECT_NAMESPACE: [project_id]}, namespace=make_namespace(PROJECT_NAMESPACE))

    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('list', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()

    control_sample_association_dump = control_sample_association_schema.dumps(control_sample_associations, many=True)
    socketio.emit('get', {CONTROL_SAMPLE_ASSOCIATION_NAMESPACE: control_sample_association_dump.data},
                  namespace=make_namespace(CONTROL_SAMPLE_ASSOCIATION_NAMESPACE))
    socketio.sleep()

    project_sample_annotations_dump = project_sample_annotations_schema.dumps(project_sample_annotations, many=True)
    socketio.emit('get', {PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE: project_sample_annotations_dump.data},
                  namespace=make_namespace(PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE))
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
    bin_estimator_id = json.get('bin_estimator_id')
    artifact_estimator_id = json.get('artifact_estimator_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    if not title:
        task_notifier.emit_task_failure(message="Title Invalid.")
        return

    if not creator:
        task_notifier.emit_task_failure(message="Creator Invalid.")
        return

    if not locus_set_id:
        task_notifier.emit_task_failure(message="Locus Set Invalid.")
        return

    if not bin_estimator_id:
        task_notifier.emit_task_failure(message="Bin Estimator Invalid.")
        return

    if artifact_estimator_id:
        artifact_estimator = ArtifactEstimatorProject.query.get(artifact_estimator_id)
        if not artifact_estimator:
            task_notifier.emit_task_failure(message="Artifact Estimator Invalid. Reload Application.")
            return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Creating Project {title}...'
    })

    locus_set = LocusSet.query.get(locus_set_id)

    if not locus_set:
        task_notifier.emit_task_failure(message="Locus Set Invalid. Reload Application")
        return

    bin_estimator = BinEstimatorProject.query.get(bin_estimator_id)

    if not bin_estimator or bin_estimator.locus_set != locus_set:
        task_notifier.emit_task_failure(message="Bin Estimator Invalid. Reload Application")
        return

    try:
        qbe_project = QuantificationBiasEstimatorProject(title=title, creator=creator, description=description,
                                                         locus_set_id=locus_set_id, bin_estimator_id=bin_estimator_id)
        if artifact_estimator_id:
            qbe_project.artifact_estimator = artifact_estimator

        db.session.add(qbe_project)
        db.session.commit()
    except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
        task_notifier.emit_task_failure(message="Title Must Be Unique.")
        db.session.rollback()
        return

    task_notifier.emit_task_success(message=f"{title} Successfully Created.")


@socketio.on('delete_project', namespace=SOCK_NAMESPACE)
def delete_project(json):
    task = "delete_project"
    project_id = json.get('project_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, project_id=project_id)
    task_notifier.emit_task_start()

    if not project_id:
        task_notifier.emit_task_failure(message="No Project Selected.")
        return

    project = QuantificationBiasEstimatorProject.query.get(project_id)

    if not project:
        task_notifier.emit_task_failure(message="Project no longer exists. Reload Application.")

    ref_genotype_projs = GenotypingProject.query.filter(
        GenotypingProject.quantification_bias_estimator_id == project.id
    ).all()

    if ref_genotype_projs:
        task_notifier.emit_task_failure(
            message=f"Cannot Delete. Quantification Bias Estimator Currently in use by {ref_genotype_projs[0].title}."
        )
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Deleting Project {project.title}...'
    })

    csas = ControlSampleAssociation.query\
        .join(ProjectSampleAnnotations)\
        .filter(ProjectSampleAnnotations.project_id == project_id)\
        .all()

    for csa in csas:
        db.session.delete(csa)

    db.session.delete(project)

    task_notifier.emit_task_success("Successfully Deleted Quantification Bias Estimator")


@socketio.on('remove_samples', namespace=SOCK_NAMESPACE)
def remove_samples(json):
    pass


@microspat_api.route('/quantification_bias_estimator_project/add_controls/', methods=['POST', 'OPTIONS'])
def add_controls_by_csv():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'Success'})

    @copy_current_request_context
    def bg_add_controls_by_csv(control_file, project_id):
        task = 'add_controls'
        task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE)
        task_notifier.emit_task_start()

        project = QuantificationBiasEstimatorProject.query.get(project_id)
        if not project:
            task_notifier.emit_task_failure(
                message="Quantification Bias Estimator Project Not Found. Restart Application."
            )
            return

        task_notifier.emit_task_progress(progress={
            'style': 'indeterminate',
            'total': 1,
            'current_state': 1,
            'message': 'Associating Controls...'
        })
        r = CaseInsensitiveDictReader(control_file)
        control_map = {}

        for d in r:
            try:
                barcode = d.pop('barcode')
            except KeyError:
                task_notifier.emit_task_failure(message="CSV file malformed. Barcode column not found.")
                return

            if not barcode:
                task_notifier.emit_task_failure(message='CSV file malformed. Barcode field empty')
                return

            sample_id = Sample.query.filter(Sample.barcode == barcode).value(Sample.id)

            if not sample_id:
                task_notifier.emit_task_failure(message=f'Sample with barcode {barcode} does not exist.')
                return

            sample_already_present = db.session.query(
                ControlSampleAssociation.query
                    .join(ProjectSampleAnnotations)
                    .filter(ProjectSampleAnnotations.project_id == project_id,
                            ProjectSampleAnnotations.sample_id == sample_id)
                    .exists()
            ).scalar()

            if sample_already_present:
                task_notifier.emit_task_failure(message=f'Sample with barcode {barcode} already in project')
                return

            controls_and_props = d.values()
            controls_and_props = list(map(lambda _: _.strip().split(';'), controls_and_props))
            controls = []
            for control_and_prop in controls_and_props:
                if len(control_and_prop) > 1:
                    control, prop = control_and_prop
                    try:
                        prop = float(prop)
                    except ValueError:
                        task_notifier.emit_task_failure(
                            message=f"Failed to associate controls. {control} proportion field malformed."
                        )
                        return
                    try:
                        c = Control.query.filter(Control.barcode == control).filter(
                            Control.bin_estimator_id == project.bin_estimator_id).one()
                    except NoResultFound:
                        task_notifier.emit_task_failure(
                            message=f"Failed to find control {control}. "
                                    f"Make sure it exists for associated Bin Estimator."
                        )
                        return
                    controls.append((c.id, prop))
                    if controls:
                        control_map[sample_id] = controls
        sample_ids = control_map.keys()
        project.add_samples(sample_ids)
        # db.session.flush()
        sample_annotation_ids = project.sample_annotations.values(
            ProjectSampleAnnotations.id, ProjectSampleAnnotations.sample_id
        )
        for sa_id, sample_id in sample_annotation_ids:
            if sample_id in control_map:
                try:
                    project.assign_controls(sa_id, control_map[sample_id])
                except BadProportions:
                    db.session.rollback()
                    task_notifier.emit_task_failure(message="Control proportions do not sum to 1")
                    return
        task_notifier.emit_task_success(message="Successfully Added Samples.")

    control_file = request.files.getlist('files')[0]
    control_file_stream = io.StringIO(control_file.stream.read().decode('utf-8'), newline=None)
    project_id = request.form.get('project_id')
    socketio.start_background_task(bg_add_controls_by_csv, control_file_stream, project_id)
    return jsonify({'status': 'Success'})


@socketio.on('analyze_loci', namespace=SOCK_NAMESPACE)
def analyze_loci(json):
    task = 'analyze_loci'
    locus_parameter_ids = json.get('locus_parameter_ids')
    parameter_settings = json.get('parameter_settings')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE,
                                 locus_parameter_ids=locus_parameter_ids,
                                 parameter_settings=parameter_settings)

    task_notifier.emit_task_start()

    if not locus_parameter_ids:
        task_notifier.emit_task_failure(message="No Locus Parameter Selected.")
        return

    lps = []
    for id in locus_parameter_ids:
        lp = QuantificationBiasEstimatorLocusParams.query.get(id)
        lps.append(lp)
    #
    # lps = QuantificationBiasEstimatorLocusParams\
    #     .query.filter(QuantificationBiasEstimatorLocusParams.id.in_(locus_parameter_ids)).all()

    if not lps:
        task_notifier.emit_task_failure(message="Locus Parameters No Longer Exist. Reload Application.")
        return

    if parameter_settings:
        for lp in lps:
            for k, v in parameter_settings.items():
                if hasattr(lp, k):
                    if getattr(lp, k) != v:
                        setattr(lp, k, v)
        socketio.sleep()

    project: QuantificationBiasEstimatorProject = lps[0].project
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

    task_notifier.emit_task_success("Succesfully Analyzed All Loci")

