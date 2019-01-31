import csv
from collections import defaultdict
from datetime import datetime

from flask import request, jsonify, copy_current_request_context, send_file
import io
import sqlalchemy.exc
import sqlite3
import tempfile

from app.microspat import dict_schemas
from app.microspat.api import microspat_api

from app.microspat.schemas import (
    DeferredChannelSchema,
    DeferredGenotypeSchema,
    DeferredProjectSampleAnnotationsSchema,
    DeferredProjectChannelAnnotationsSchema,
    GenotypingProjectSchema,
    GenotypingLocusParamsSchema,
    BinEstimatorProjectSchema,
    LocusBinSetSchema,
    BinSchema)

from app.microspat.models import (
    ArtifactEstimatorProject,
    Bin,
    BinEstimatorProject,
    Channel,
    Genotype,
    GenotypingLocusParams,
    GenotypingProject,
    Locus,
    LocusBinSet,
    LocusSet,
    ProjectSampleAnnotations,
    ProjectChannelAnnotations,
    QuantificationBiasEstimatorProject,
    Sample,
    Well,
)

from app.utils import CaseInsensitiveDictReader

from app.microspat.events.base import (
    base_get_updated,
    base_list,
    extract_ids,
    make_namespace,
    table_to_string_mapping,
    TaskNotifier,
)

from app import socketio, db

JSON_NAMESPACE = table_to_string_mapping[GenotypingProject]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_NAMESPACE = table_to_string_mapping[GenotypingProject]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]
LOCUS_PARAMS_NAMESPACE = table_to_string_mapping[GenotypingLocusParams]
PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectSampleAnnotations]
GENOTYPE_NAMESPACE = table_to_string_mapping[Genotype]
PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]

BIN_ESTIMATOR_PROJECT_NAMESPACE = table_to_string_mapping[BinEstimatorProject]
LOCUS_BIN_SET_NAMESPACE = table_to_string_mapping[LocusBinSet]
BIN_NAMESPACE = table_to_string_mapping[Bin]

project_schema = GenotypingProjectSchema()
project_dict_schema = dict_schemas.GenotypingProjectSchema()
channel_schema = DeferredChannelSchema(exclude="data")
locus_params_schema = GenotypingLocusParamsSchema()
project_sample_annotations_schema = DeferredProjectSampleAnnotationsSchema()
project_channel_annotations_schema = DeferredProjectChannelAnnotationsSchema()
genotype_schema = DeferredGenotypeSchema()

bin_estimator_project_schema = BinEstimatorProjectSchema()
locus_bin_set_schema = LocusBinSetSchema()
bin_schema = BinSchema()


socketio.on_event('list', base_list(GenotypingProject, project_dict_schema, JSON_NAMESPACE,
                                    query=GenotypingProject.get_serialized_list),
                  namespace=SOCK_NAMESPACE)
# socketio.on_event('get_updated', base_get_updated(GenotypingProject, project_schema, project_schema, JSON_NAMESPACE), namespace=SOCK_NAMESPACE)


@socketio.on('get_updated', namespace=SOCK_NAMESPACE)
@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_genotyping_project(json):
    ids = extract_ids(json)
    projects = []
    channels = []
    locus_parameters = []
    genotypes = []
    project_sample_annotations = []
    project_channel_annotations = []

    bin_estimator_projects = []
    locus_bin_sets = []
    bins = []

    for project_id in ids:
        p = GenotypingProject.query.get(project_id)
        socketio.sleep()

        if p:
            projects.append(p)
            channels += p.get_serialized_channels()
            socketio.sleep()

            locus_parameters += p.locus_parameters.all()
            socketio.sleep()

            project_sample_annotations += ProjectSampleAnnotations.get_serialized_list(project_id)
            socketio.sleep()

            genotypes += Genotype.get_serialized_list(project_id)
            socketio.sleep()

            project_channel_annotations += ProjectChannelAnnotations.get_serialized_list(project_id)
            socketio.sleep()

            curr_locus_bin_sets = LocusBinSet.query.filter(LocusBinSet.project_id == p.bin_estimator_id).all()
            locus_bin_sets += curr_locus_bin_sets
            for lb in curr_locus_bin_sets:
                bins += lb.bins
        else:
            socketio.emit('get_failed', {PROJECT_NAMESPACE: [project_id]}, namespace=make_namespace(PROJECT_NAMESPACE))

    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('list', {CHANNEL_NAMESPACE: channel_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()

    project_sample_annotations_dump = project_sample_annotations_schema.dumps(project_sample_annotations, many=True)
    socketio.emit('get', {PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE: project_sample_annotations_dump.data},
                  namespace=make_namespace(PROJECT_SAMPLE_ANNOTATIONS_NAMESPACE))
    socketio.sleep()

    genotypes_dump = genotype_schema.dumps(genotypes, many=True)
    socketio.emit('get', {GENOTYPE_NAMESPACE: genotypes_dump.data}, namespace=make_namespace(GENOTYPE_NAMESPACE))
    socketio.sleep()

    project_channel_annotations_dump = project_channel_annotations_schema.dumps(project_channel_annotations, many=True)
    socketio.emit('get', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: project_channel_annotations_dump.data},
                  namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))
    socketio.sleep()

    locus_params_dump = locus_params_schema.dumps(locus_parameters, many=True)
    socketio.emit('get', {LOCUS_PARAMS_NAMESPACE: locus_params_dump.data},
                  namespace=make_namespace(LOCUS_PARAMS_NAMESPACE))
    socketio.sleep()

    bins_dump = bin_schema.dumps(bins, many=True)
    socketio.emit('get', {BIN_NAMESPACE: bins_dump.data}, namespace=make_namespace(BIN_NAMESPACE))
    socketio.sleep()

    locus_bin_sets_dump = locus_bin_set_schema.dumps(locus_bin_sets, many=True)
    socketio.emit('get', {LOCUS_BIN_SET_NAMESPACE: locus_bin_sets_dump.data},
                  namespace=make_namespace(LOCUS_BIN_SET_NAMESPACE))
    socketio.sleep()

    bin_estimator_project_dump = bin_estimator_project_schema.dumps(bin_estimator_projects, many=True)
    socketio.emit('get', {BIN_ESTIMATOR_PROJECT_NAMESPACE: bin_estimator_project_dump.data},
                  namespace=make_namespace(BIN_ESTIMATOR_PROJECT_NAMESPACE))
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
    bin_estimator_id = json.get('bin_estimator_id')
    artifact_estimator_id = json.get('artifact_estimator_id', None)
    quantification_bias_estimator_id = json.get('quantification_bias_estimator_id', None)

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    if not title:
        task_notifier.emit_task_failure(message="Title Invalid.")
        return

    if not locus_set_id:
        task_notifier.emit_task_failure(message="Locus Set Invalid.")
        return

    if not bin_estimator_id:
        task_notifier.emit_task_failure(message="Bin Estimator Invalid.")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Creating Project {title}...'
    })

    locus_set = LocusSet.query.get(locus_set_id)

    if not locus_set:
        task_notifier.emit_task_failure(message="Locus Set Invalid.")
        return

    bin_estimator = BinEstimatorProject.query.get(bin_estimator_id)

    if not bin_estimator or bin_estimator.locus_set != locus_set:
        task_notifier.emit_task_failure(message="Bin Estimator Invalid.")
        return

    if artifact_estimator_id:
        artifact_estimator = ArtifactEstimatorProject.query.get(artifact_estimator_id)
        if not artifact_estimator or artifact_estimator.locus_set != locus_set:
            task_notifier.emit_task_failure(message="Artifact Estimator Invalid.")
            return

    if quantification_bias_estimator_id:
        quantification_bias_estimator = QuantificationBiasEstimatorProject.query.get(quantification_bias_estimator_id)
        if not quantification_bias_estimator or quantification_bias_estimator.locus_set != locus_set:
            task_notifier.emit_task_failure(message="Quantification Bias Estimator Invalid.")
            return

    try:
        genotyping_project = GenotypingProject(title=title, creator=creator, description=description,
                                               locus_set_id=locus_set_id, bin_estimator_id=bin_estimator_id,
                                               artifact_estimator_id=artifact_estimator_id,
                                               quantification_bias_estimator_id=quantification_bias_estimator_id)
        db.session.add(genotyping_project)
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

    project = GenotypingProject.query.get(project_id)

    if not project:
        task_notifier.emit_task_failure(message="Project no longer exists. Reload Application.")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': f'Deleting Project {project.title}...'
    })

    db.session.delete(project)
    db.session.commit()

    task_notifier.emit_task_success("Successfully Deleted Genotyping Project.")


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

    project = GenotypingProject.query.get(project_id)

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


@microspat_api.route('/genotyping_project/add_samples/', methods=['POST', 'OPTIONS'])
def add_samples_by_csv():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'Success'})

    @copy_current_request_context
    def bg_add_samples_by_csv(sample_file, project_id):
        task = 'add_samples'
        task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE)
        task_notifier.emit_task_start()

        project = GenotypingProject.query.get(project_id)
        if not project:
            task_notifier.emit_task_failure(message="Genotyping Project Not Found. Restart Application.")

        sample_ids = []
        try:
            task_notifier.emit_task_progress(progress={
                'style': 'indeterminate',
                'total': 1,
                'current_state': 1,
                'message': 'Adding Samples...'
            })
            r = CaseInsensitiveDictReader(sample_file)

            for line in r:
                barcode = line['sample_id']
                sample = Sample.query.filter(Sample.barcode == barcode).first()
                if not sample:
                    task_notifier.emit_task_failure(message=f"Sample with barcode '{barcode}' does not exist.")
                    return
                sample_ids.append(sample.id)
            project.add_samples(sample_ids)
        except KeyError:
            task_notifier.emit_task_failure(message=f"File Malformed. Header must be 'Sample ID'")

        project.last_updated = datetime.utcnow()

        task_notifier.emit_task_success(message="Successfully Added Samples.")

    sample_file = request.files.getlist('files')[0]
    sample_file_stream = io.StringIO(sample_file.stream.read().decode("utf-8"), newline=None)
    project_id = request.form.get('project_id')
    socketio.start_background_task(bg_add_samples_by_csv, sample_file_stream, project_id)
    return jsonify({'status': 'Success'})


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

    project = GenotypingProject.query.get(project_id)

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

    lps: list[GenotypingLocusParams] = GenotypingLocusParams.query.filter(
        GenotypingLocusParams.id.in_(locus_parameter_ids)
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

    task_notifier.emit_task_success("Succesfully Analyzed All Loci")


@socketio.on('toggle_allele', namespace=SOCK_NAMESPACE)
def toggle_allele(json):
    task = "toggle_allele"
    genotype_id = json.get('genotype_id')
    bin_id = str(json.get('bin_id'))

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    if not genotype_id:
        task_notifier.emit_task_failure(message="No Genotype Selected.")
        return

    if not bin_id:
        task_notifier.emit_task_failure(message="No Bin Selected.")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': 'Toggling Allele...'
    })

    genotype = Genotype.query.get(genotype_id)

    if not genotype:
        task_notifier.emit_task_failure(message="Genotype No Longer Exists. Reload Application...")
        return

    if bin_id not in genotype.alleles:
        task_notifier.emit_task_failure(message="Allele Not Valid. Reload Application...")
        return

    genotype.toggle_allele(bin_id)
    db.session.commit()

    task_notifier.emit_task_success("Successfully Toggled Allele")


@socketio.on('calculate_peak_probabilities', namespace=SOCK_NAMESPACE)
def calculate_peak_probabilities(json):
    task = "calculate_peak_probabilities"
    project_id = json.get('project_id')

    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, **json)

    task_notifier.emit_task_start()

    if not project_id:
        task_notifier.emit_task_failure(message="No Project Selected.")
        return

    task_notifier.emit_task_progress(progress={
        'style': 'indeterminate',
        'total': 1,
        'current_state': 1,
        'message': 'Calculating Probabilities...'
    })

    project = GenotypingProject.query.get(project_id)

    if not project:
        task_notifier.emit_task_failure(message="Project No Longer Exists. Reload Application...")
        return

    project.annotate_peak_probability()
    db.session.commit()

    task_notifier.emit_task_success("Succesfully Calculated Peak Probabilities")


@microspat_api.route('/genotyping_project/<int:id>/get_peak_data/', methods=['GET'])
def get_genotyping_peak_data(id):
    gp_title = GenotypingProject.query.filter(GenotypingProject.id == id).value(GenotypingProject.title)
    results = []
    header = ["Sample", "Locus", "Peak Height", "Relative Peak Height", "Corrected Proportion", "Peak Size",
              "Peak Area", "Left Tail",
              "Right Tail", "Artifact Contribution", "Artifact Error", "In Bin", "Called Allele", "Allele Label",
              "Bleedthrough Ratio", "Crosstalk Ratio", "Probability", "Well", "Artifact Flag",
              "Below Relative Threshold Flag", "Bleedthrough Flag", "Crosstalk Flag"]
    locus_annotations = Genotype.query.filter(Genotype.project_id == id).join(
        Locus).join(ProjectChannelAnnotations).join(Channel).join(Well).values(
        Genotype.annotated_peaks, Genotype.sample_annotations_id, Locus.label,
        Well.well_label, Genotype.alleles, Genotype.flags)
    sample_ids = dict(ProjectSampleAnnotations.query.distinct().join(Sample).filter(
        ProjectSampleAnnotations.project_id == id).values(ProjectSampleAnnotations.id, Sample.barcode))
    for la in locus_annotations:
        if not la[5].get('failure'):
            alleles = la[4].items()
            bin_ids = [str(x[0]) for x in alleles if x[1]]
            for peak in la[0]:
                res = dict()
                res["Sample"] = sample_ids[la[1]]
                res["Locus"] = la[2]
                res["Peak Height"] = peak['peak_height']
                res["Corrected Proportion"] = peak.get('corrected_relative_quantification', 'NA')
                res["Peak Size"] = peak['peak_size']
                res["Peak Area"] = peak['peak_area']
                res["Left Tail"] = peak['left_tail']
                res["Right Tail"] = peak['right_tail']
                res["Artifact Contribution"] = peak.get('artifact_contribution', 'NA')
                res["Artifact Error"] = peak.get('artifact_error', 'NA')
                res["Artifact Flag"] = peak['flags']['artifact']
                res["Below Relative Threshold Flag"] = peak['flags']['below_relative_threshold']
                res["Crosstalk Flag"] = peak['flags']['crosstalk']
                res["Bleedthrough Flag"] = peak['flags']['bleedthrough']
                res["In Bin"] = bool(peak['bin_id'])
                res["Relative Peak Height"] = peak['relative_peak_height']
                if res["In Bin"]:
                    res["Called Allele"] = str(peak['bin_id']) in bin_ids
                    res["Allele Label"] = str(peak['bin'])
                res["Bleedthrough Ratio"] = peak['bleedthrough_ratio']
                res["Crosstalk Ratio"] = peak['crosstalk_ratio']
                res["Well"] = la[3]
                res['Probability'] = peak.get('probability', 'NA')
                results.append(res)
    handle, temp_path = tempfile.mkstemp()
    with open(temp_path, 'w') as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(results)
    return send_file(temp_path, as_attachment=True, attachment_filename="{} Peak Data.csv".format(gp_title))


@microspat_api.route('/genotyping_project/<int:id>/get_alleles/', methods=['GET'])
def get_alleles(id):
    gp = GenotypingProject.query.get(id)
    loci = gp.locus_set.loci
    results = []

    la_dict = defaultdict(list)
    locus_annotations = Genotype.query.filter(Genotype.project_id == id).all()
    for locus_annotation in locus_annotations:
        la_dict[locus_annotation.sample_annotations_id].append(locus_annotation)

    sample_annotations_ids = ProjectSampleAnnotations.query.filter(
        ProjectSampleAnnotations.project_id == id).values(
        ProjectSampleAnnotations.id)

    sample_ids = dict(ProjectSampleAnnotations.query.distinct().join(Sample).filter(
        ProjectSampleAnnotations.project_id == id).values(ProjectSampleAnnotations.id, Sample.barcode))

    bins = dict(Bin.query.join(LocusBinSet).join(BinEstimatorProject).filter(
        BinEstimatorProject.id == gp.bin_estimator_id).values(Bin.id, Bin.label))

    header = ["Sample"] + [_.label for _ in loci]
    for sa_id in sample_annotations_ids:
        sa_id = sa_id[0]
        sample_res = dict()
        sample_res['Sample'] = sample_ids[sa_id]
        for la in la_dict[sa_id]:
            alleles = la.alleles.items()
            bin_ids = [x[0] for x in alleles if x[1]]
            try:
                bin_ids.remove("None")
            except ValueError:
                pass
            present_alleles = [bins[int(bin_id)] for bin_id in bin_ids]
            sample_res[la.locus.label] = ";".join(present_alleles)
        results.append(sample_res)
    handle, temp_path = tempfile.mkstemp()
    with open(temp_path, 'w') as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(results)
    return send_file(temp_path, as_attachment=True, attachment_filename="{} Alleles.csv".format(gp.title))
