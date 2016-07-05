import eventlet
from flask import Blueprint, jsonify, request
from flask_socketio import emit
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.utils.Utils import CaseInsensitiveDictReader
from models import *

plasmomapper = Blueprint('plasmomapper', import_name=__name__, template_folder='templates',
                         url_prefix='/plasmomapper/api/v1')


@plasmomapper.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


def wrap_data(data):
    res = {
        'data': data
    }
    return res


def handle_integrity_error(e):
    """
    :type e: IntegrityError
    """
    print "Handling Integrity Error"
    res = jsonify(error=e.orig.args[0])
    res.status_code = 400
    return res


def handle_error(e):
    db.session.rollback()
    print "Exception Happened"
    print e
    if isinstance(e, IntegrityError):
        return handle_integrity_error(e)
    else:
        if hasattr(e, 'message'):
            res = jsonify(error=e.message)
            res.status_code = 400
        elif type(e) is str:
            res = jsonify(error=e)
            res.status_code = 400
        else:
            res = jsonify(error=e)
            res.status_code = 500
        return res


def table_list_all(table):
    items = table.query.all()
    res = wrap_data([x.serialize() for x in items])
    return jsonify(res)


def table_get_details(table, id):
    item = table.query.get(id)
    if hasattr(item, 'serialize_details'):
        res = wrap_data(item.serialize_details())
    else:
        res = wrap_data(item.serialize())
    return jsonify(res)


def update_peak_scanner(target, update_dict):
    """
    :type update_dict: dict
    :type target: PeakScanner
    """
    if update_dict['scanning_method'] == 'relmax':
        target.scanning_method = 'relmax'
        target.argrelmax_window = update_dict['argrelmax_window']
        target.trace_smoothing_window = update_dict['trace_smoothing_window']
        target.trace_smoothing_order = update_dict['trace_smoothing_order']
        target.tophat_factor = update_dict['tophat_factor']
    elif update_dict['scanning_method'] == 'cwt':
        target.scanning_method = 'cwt'
        target.cwt_min_width = update_dict['cwt_min_width']
        target.cwt_max_width = update_dict['cwt_max_width']
        target.min_snr = update_dict['min_snr']
        target.noise_perc = update_dict['noise_perc']
    target.maxima_window = update_dict['maxima_window']
    return target


def update_locus_params(target, update_dict):
    """
    :type update_dict: dict
    :type target: ProjectLocusParams
    """
    update_peak_scanner(target, update_dict)
    target.min_peak_height = update_dict['min_peak_height']
    target.max_peak_height = update_dict['max_peak_height']
    target.min_peak_height_ratio = update_dict['min_peak_height_ratio']
    target.max_bleedthrough = update_dict['max_bleedthrough']
    target.max_crosstalk = update_dict['max_crosstalk']
    target.min_peak_distance = update_dict['min_peak_distance']
    return target


def update_bin_estimator_locus_params(target, update_dict):
    """
    :type update_dict: dict
    :type target: BinEstimatorLocusParams
    """
    update_locus_params(target, update_dict)
    target.min_peak_frequency = update_dict['min_peak_frequency']
    target.default_bin_buffer = update_dict['default_bin_buffer']
    return target


def update_artifact_locus_params(target, update_dict):
    """
    :type target: ArtifactEstimatorLocusParams
    """
    update_locus_params(target, update_dict)
    target.max_secondary_relative_peak_height = update_dict['max_secondary_relative_peak_height']
    target.min_artifact_peak_frequency = update_dict['min_artifact_peak_frequency']
    return target


def update_genotyping_locus_params(target, update_dict):
    """
    :type target: GenotypingLocusParams
    """
    update_locus_params(target, update_dict)
    target.soft_artifact_sd_limit = update_dict['soft_artifact_sd_limit']
    target.hard_artifact_sd_limit = update_dict['hard_artifact_sd_limit']
    target.offscale_threshold = update_dict['offscale_threshold']
    target.bleedthrough_filter_limit = update_dict['bleedthrough_filter_limit']
    target.crosstalk_filter_limit = update_dict['crosstalk_filter_limit']
    target.relative_peak_height_limit = update_dict['relative_peak_height_limit']
    target.absolute_peak_height_limit = update_dict['absolute_peak_height_limit']
    target.failure_threshold = update_dict['failure_threshold']
    return target


def update_project(target, update_dict):
    target.title = update_dict['title']
    target.creator = update_dict['creator']
    target.description = update_dict['description']
    return target


def load_plate_map(plate_map_file, plate):
    r = csv.DictReader(plate_map_file)
    locus_labels = r.fieldnames
    locus_labels = [x for x in locus_labels if x.lower() not in ['', 'well']]
    new_channels = defaultdict(list)
    clear_channel_annotations(plate.id)
    for entry in r:
        eventlet.sleep()
        well_label = entry['Well']
        for locus_label in locus_labels:
            sample_barcode = entry[locus_label]
            if sample_barcode:
                sample = Sample.query.filter(Sample.barcode == sample_barcode).one()
                if not sample:
                    return handle_error("Sample with barcode {} does not exist".format(sample_barcode))
                locus = Locus.query.filter(Locus.label == locus_label).one()
                if not locus:
                    return handle_error("Locus with label {} does not exist".format(locus_label))
                projects = list(
                    GenotypingProject.query.join(LocusSet).join(locus_set_association_table).join(Locus).join(
                        ProjectSampleAnnotations).filter(Locus.id == locus.id).filter(
                        ProjectSampleAnnotations.sample_id == sample.id).values(GenotypingProject.id))
                projects = [x[0] for x in projects]
                well = plate.wells_dict[well_label]
                channel = well.channels_dict[locus.color]
                channel.add_locus(locus.id)
                channel.add_sample(sample.id)
                for project_id in projects:
                    new_channels[project_id].append(channel.id)
    db.session.flush()
    plate.check_contamination()
    for project_id in new_channels.keys():
        project = Project.query.get(project_id)
        print "Adding New Channels"
        project.add_channels(new_channels[project_id])
    db.session.commit()
    plate = Plate.query.get(plate.id)
    return jsonify(wrap_data(plate.serialize()))


def clear_channel_annotations(plate_id):
    sample_locus_annotations = SampleLocusAnnotation.query.join(ProjectChannelAnnotations).join(Channel).join(Well).join(Plate).filter(Plate.id == plate_id).all()
    print str(len(sample_locus_annotations)) + " Reference Runs"
    for sample_locus_annotation in sample_locus_annotations:
        eventlet.sleep()
        assert isinstance(sample_locus_annotation, SampleLocusAnnotation)
        sample_locus_annotation.reference_run = None
        sample_locus_annotation.flags = {}
        sample_locus_annotation.annotated_peaks = []
        sample_locus_annotation.alleles = dict.fromkeys(sample_locus_annotation.alleles, False)
    # db.session.flush()
    channel_annotations = ProjectChannelAnnotations.query.join(Channel).join(Well).join(Plate).filter(Plate.id == plate_id).all()
    for annotation in channel_annotations:
        db.session.delete(annotation)
    db.session.flush()


def send_message(msg):
    socketio.emit('message', {'message': msg}, namespace='/')


@plasmomapper.route('/', defaults={'path': ''})
@plasmomapper.route('/<path:path>')
def catch_all(path):
    res = jsonify(error='Not Found')
    res.status_code = 404
    return res

@socketio.on('connect')
def test_message(message=None):
    print "Connected Socket"
    emit('test', 'test')
    emit('message', request.sid + ' Connected', broadcast=True)
    # for i in range(1, 101):
    #     send_message(i)
    # plates = Plate.query.all()
    # if plates:
    #     plates = [x.to_json() for x in plates]
    # socketio.emit('all_projects', wrap_data(plates))

@socketio.on('client_test')
def client_test(message=None):
    print message
    emit('server_test', 'Success')


@socketio.on('list', namespace='/project')
def socket_get_or_post_projects():
    send_message('GETTING/POSTING PROJECTS')
    projects = GenotypingProject.query.all()
    emit('list_all', [x.serialize() for x in projects])
    print "Done Listing Projects"


@socketio.on('list')
def list_items():
    print "List without namespace pinged"


@plasmomapper.route('/genotyping-project/', methods=['GET', 'POST'])
def get_or_post_projects():
    if request.method == 'GET':
        return table_list_all(GenotypingProject)
    elif request.method == 'POST':
        project_params = request.json
        print project_params
        try:
            print "Adding a new project"
            project = GenotypingProject(**project_params)
            db.session.add(project)
            db.session.flush()
            return jsonify(wrap_data(project.serialize_details()))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/genotyping-project/calculate-probability/', methods=['POST'])
def calculate_probability():
    project_json = request.json
    project = GenotypingProject.query.get(project_json['id'])
    assert isinstance(project, GenotypingProject)
    project.probability_threshold = project_json['probability_threshold']
    project.probabilistic_peak_annotation()
    db.session.commit()
    return jsonify(wrap_data(project.serialize_details()))


@plasmomapper.route('/genotyping-project/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_or_update_project(id):
    if request.method == 'GET':
        return table_get_details(GenotypingProject, id)
    elif request.method == 'PUT':
        print "Updating Project"
        project_update_dict = request.json
        project = GenotypingProject.query.get(id)
        if project:
            try:
                project = update_project(project, project_update_dict)
                print project
                print project_update_dict
                print "Putting Project in DB"
                db.session.commit()
                print project
                print project_update_dict
                return jsonify(wrap_data(project.serialize_details()))
            except Exception as e:
                return handle_error(e)
        else:
            err = "Uh Oh, Project Doesn't Exist"
            return handle_error(err)
    elif request.method == 'DELETE':
        project = GenotypingProject.query.get(id)
        try:
            db.session.delete(project)
            return jsonify(wrap_data({"id": "project.id"}))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/genotyping-project/<int:id>/add-samples/', methods=['POST'])
def genotyping_project_add_samples(id):
    gp = GenotypingProject.query.get(id)
    assert isinstance(gp, GenotypingProject)
    files = request.files.getlist('files')

    if not files:
        return handle_error("Nothing Uploaded")

    sample_ids = set()
    for sample_file in files:
        if sample_file.filename[-4:] != '.csv':
            return handle_error("Uploaded file is not a csv.")

        r = CaseInsensitiveDictReader(sample_file)

        if 'barcode' not in r.fieldnames:
            return handle_error("File header not valid")

        for sample_entry in r:
            sample_ids.add(Sample.query.filter(Sample.barcode == sample_entry['barcode']).value(Sample.id))

    gp.add_samples(list(sample_ids))
    return jsonify(wrap_data(gp.serialize_details()))


@plasmomapper.route('/artifact-estimator-project/', methods=['GET', 'POST'])
def get_or_create_artifact_estimators():
    if request.method == 'GET':
        return table_list_all(ArtifactEstimatorProject)
    elif request.method == 'POST':
        project_params = request.json
        try:
            project = ArtifactEstimatorProject(**project_params)
            db.session.add(project)
            db.session.flush()
            project.initialize_project()
            return jsonify(wrap_data(project.serialize_details()))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/artifact-estimator-project/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_or_update_artifact_estimator(id):
    if request.method == 'GET':
        return table_get_details(ArtifactEstimatorProject, id)
    elif request.method == 'PUT':
        project_update_dict = request.json
        project = ArtifactEstimatorProject.query.get(id)
        if project:
            try:
                project = update_project(project, project_update_dict)
                db.session.commit()
                return jsonify(wrap_data(project.serialize_details()))
            except Exception as e:
                return handle_error(e)
        else:
            err = "Uh Oh, Project doesn't exist anymore"
            return handle_error(err)
    elif request.method == 'DELETE':
        project = ArtifactEstimatorProject.query.get(id)
        genotyping_project = GenotypingProject.query.filter(
            GenotypingProject.artifact_estimator_id == project.id).first()
        if genotyping_project:
            return handle_error(
                "Artifact estimator is used in Genotyping Project {}. Cannot Delete.".format(genotyping_project.title)
            )
        try:
            db.session.delete(project)
            return jsonify(wrap_data(({'id': 'project.id'})))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/artifact-estimator/<int:id>/', methods=['DELETE'])
def delete_estimator(id):
    try:
        estimator = ArtifactEstimator.query.get(id)
        assert isinstance(estimator, ArtifactEstimator)
        genotyping_projects = GenotypingProject.query.filter(
            GenotypingProject.artifact_estimator_id == estimator.locus_artifact_estimator.project.id).all()
        locus_id = estimator.locus_artifact_estimator.locus_id
        print locus_id
        for project in genotyping_projects:
            project.artifact_estimator_changed(locus_id)
        db.session.delete(estimator)
        return jsonify(wrap_data({'id': estimator.id}))
    except Exception as e:
        return handle_error(e)


@plasmomapper.route('/artifact-estimator/<int:id>/', methods=['POST'])
def add_breakpoint(id):
    try:
        estimator = ArtifactEstimator.query.get(id)
        assert isinstance(estimator, ArtifactEstimator)
        breakpoint = float(request.json['breakpoint'])
        print breakpoint
        estimator.add_breakpoint(breakpoint)

        return jsonify(wrap_data(estimator.serialize()))
    except Exception as e:
        return handle_error(e)


@plasmomapper.route('/artifact-estimator/<int:id>/clear-breakpoints/', methods=['GET'])
def clear_breakpoints(id):
    try:
        estimator = ArtifactEstimator.query.get(id)
        assert isinstance(estimator, ArtifactEstimator)
        estimator.clear_breakpoints()
        return jsonify(wrap_data(estimator.serialize()))
    except Exception as e:
        return handle_error(e)


@plasmomapper.route('/bin-estimator/', methods=['GET', 'POST'])
def get_or_create_bin_estimators():
    if request.method == 'GET':
        return table_list_all(BinEstimatorProject)
    elif request.method == 'POST':
        project_params = request.json
        print project_params
        try:
            print "Adding a new project"
            project = BinEstimatorProject(**project_params)
            db.session.add(project)
            db.session.flush()
            project.initialize_project()
            return jsonify(wrap_data(project.serialize_details()))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/bin-estimator/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_or_update_bin_estimator(id):
    if request.method == 'GET':
        return table_get_details(BinEstimatorProject, id)
    elif request.method == 'PUT':
        print "Updating Project"
        project_update_dict = request.json
        project = BinEstimatorProject.query.get(id)
        if project:
            try:
                project = update_project(project, project_update_dict)
                db.session.commit()
                return jsonify(wrap_data(project.serialize_details()))
            except Exception as e:
                return handle_error(e)
        else:
            err = "Uh Oh, Project doesn't exist anymore."
            return handle_error(err)
    elif request.method == 'DELETE':
        project = BinEstimatorProject.query.get(id)
        genotyping_project = GenotypingProject.query.filter(GenotypingProject.bin_estimator_id == project.id).first()
        if genotyping_project:
            return handle_error(
                "Bin estimator is used in Genotyping Project {}. Cannot Delete.".format(genotyping_project.title))
        artifact_estimator = ArtifactEstimatorProject.query.filter(
            ArtifactEstimatorProject.bin_estimator_id == project.id).first()
        if artifact_estimator:
            return handle_error(
                "Bin estimator is used in an Artifact Estimator {}. Cannot Delete.".format(artifact_estimator.title))
        try:
            db.session.delete(project)
            return jsonify(wrap_data({"status": "Success"}))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/locus-parameters/<int:id>/', methods=['GET', 'PUT'])
def get_or_update_locus_parameters(id):
    update_fns = {
        'artifact_estimator_locus_params': update_artifact_locus_params,
        'genotyping_locus_params': update_genotyping_locus_params,
        'bin_estimator_locus_params': update_bin_estimator_locus_params,
        'base_locus_params': update_locus_params
    }
    if request.method == 'GET':
        return table_get_details(ProjectLocusParams, id)
    elif request.method == 'PUT':
        print request.json
        locus_params_update_dict = request.json
        locus_params = ProjectLocusParams.query.get(id)
        assert isinstance(locus_params, ProjectLocusParams)
        project = Project.query.get(locus_params.project_id)
        if locus_params:
            try:
                updater = update_fns.get(locus_params.discriminator, update_locus_params)
                locus_params = updater(locus_params, locus_params_update_dict)
                db.session.flush()
                project.analyze_locus(locus_params.locus_id)
                print locus_params.serialize()
                return jsonify(wrap_data(locus_params.serialize()))
            except SQLAlchemyError as e:
                return handle_error(e)
        else:
            return jsonify(error="No Record Found", status=404)


@plasmomapper.route('/locus/', methods=['GET', 'POST'])
def get_loci():
    if request.method == 'GET':
        return table_list_all(Locus)
    elif request.method == 'POST':
        locus_params = request.json
        try:
            locus = Locus(**locus_params)
            db.session.add(locus)
            db.session.flush()
            return jsonify(wrap_data(locus.serialize()))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/locus/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_locus(id):
    if request.method == 'GET':
        return table_get_details(Locus, id)
    elif request.method == 'DELETE':
        locus = Locus.query.get(id)
        locus_sets = LocusSet.query.join(locus_set_association_table).join(Locus).filter(Locus.id == id).all()
        if locus_sets:
            err = "Locus is a member of a locus panel. Delete the panel first."
            return handle_error(err)
        else:
            try:
                db.session.delete(locus)
                return jsonify(wrap_data({'status': 'Success'}))
            except Exception as e:
                return handle_error(e)


@plasmomapper.route('/locus-set/', methods=['GET', 'POST'])
def get_or_post_locus_sets():
    if request.method == 'GET':
        return table_list_all(LocusSet)
    elif request.method == 'POST':
        locus_set_params = request.json['locus_set']
        locus_ids = request.json['locus_ids']
        try:
            locus_set = LocusSet(**locus_set_params)
            print locus_ids
            for locus_id in locus_ids:
                locus = Locus.query.get(int(locus_id))
                locus_set.loci.append(locus)
            db.session.add(locus_set)
            db.session.flush()
            return jsonify(wrap_data(locus_set.serialize()))
        except Exception as e:
            return handle_error(e)


@plasmomapper.route('/locus-set/<int:id>/', methods=['GET', 'DELETE'])
def get_locus_set(id):
    if request.method == 'GET':
        return table_get_details(LocusSet, id)
    elif request.method == 'DELETE':
        locus_set = LocusSet.query.get(id)
        projects = Project.query.filter(Project.locus_set_id == locus_set.id).all()
        if projects:
            err = "Locus Set is used by a project. Delete the project first."
            return handle_error(err)
        else:
            try:
                db.session.delete(locus_set)
                return jsonify(wrap_data({'status': 'Success'}))
            except Exception as e:
                return handle_error(e)


@plasmomapper.route('/ladder/')
def get_ladders():
    return table_list_all(Ladder)


@plasmomapper.route('/ladder/<int:id>')
def get_ladder(id):
    return table_get_details(Ladder, id)


@plasmomapper.route('/sample/', methods=['GET'])
def get_samples():
    return table_list_all(Sample)


@plasmomapper.route('/sample/', methods=['POST'])
def post_sample_csv():
    sample_csvs = request.files.getlist('files')

    if not sample_csvs:
        return handle_error("Nothing Uploaded")

    positive_designations = ['pos', 'positive_control', 'positive', 'positive control', '+', 'pc']
    negative_designations = ['neg', 'negative_control', 'negative', 'negative control', '-', 'nc']
    sample_designations = ['s', 'sample', '']

    samples = []

    try:
        for sample_csv in sample_csvs:

            if sample_csv.filename[-4:] != ".csv":
                return handle_error("Uploaded file is not a CSV")

            r = CaseInsensitiveDictReader(sample_csv)

            if sorted(r.fieldnames) != ['barcode', 'designation']:
                return handle_error("CSV fieldnames invalid. Header must be ['Barcode', 'Designation']")

            for sample_entry in r:
                if sample_entry['designation'].lower() in positive_designations:
                    sample_entry['designation'] = 'positive_control'
                elif sample_entry['designation'].lower() in negative_designations:
                    sample_entry['designation'] = 'negative_control'
                elif sample_entry['designation'].lower() in sample_designations:
                    sample_entry['designation'] = 'sample'
                else:
                    return handle_error("Sample designation {} is not valid".format(sample_entry['designation']))

                barcode = sample_entry['barcode']
                designation = sample_entry['designation']

                sample = Sample(barcode=barcode, designation=designation)

                db.session.add(sample)
                samples.append(sample)
        db.session.flush()
    except Exception as e:
        print "Error Hit"
        return handle_error(e)

    return jsonify(wrap_data([sample.serialize() for sample in samples]))


@plasmomapper.route('/sample/<int:id>/')
def get_sample(id):
    return table_get_details(Sample, id)


@plasmomapper.route('/plate/', methods=['GET'])
def get_plates():
    return jsonify(wrap_data(Plate.get_serialized_list()))


@plasmomapper.route('/plate/', methods=['POST'])
def save_plate():
    print "POSTING PLATE"
    print request.files
    plate_zips = request.files.getlist('files')
    ladder_id = request.form['ladder_id']
    if ladder_id == 'undefined':
        print "Ladder ID is undefined"
        res = jsonify(error="Please Select a Ladder")
        res.status_code = 404
        return res
    if plate_zips:
        try:
            plate_ids = []
            for plate_zip in plate_zips:
                print "Unpacking Plate"
                p_id = Plate.from_zip(plate_zip, ladder_id)
                plate_ids.append(p_id)
            db.session.expire_all()
            return jsonify(wrap_data([Plate.query.get(plate_id).serialize() for plate_id in plate_ids]))
        except Exception as e:
            return handle_error(e)
    else:
        res = jsonify(error="Nothing Uploaded")
        res.status_code = 404
        return res


@plasmomapper.route('/plate/<int:id>/', methods=['GET', 'POST'])
def get_plate(id):
    if request.method == 'GET':
        return table_get_details(Plate, id)
    elif request.method == 'POST':
        print "Loading Plate Map"
        plate_map_list = request.files.getlist('files')
        if plate_map_list:
            try:
                plate_map = plate_map_list[0]
                plate = Plate.query.get(id)
                return load_plate_map(plate_map, plate)
            except Exception as e:
                return handle_error(e)
        else:
            return handle_error("Nothing Submitted")


@plasmomapper.route('/plate/locus/<int:id>/', methods=['GET'])
def get_plates_with_locus(id):
    plate_ids = set(Plate.query.join(Well).join(Channel).filter(Channel.locus_id == 196).values(Plate.id))
    return jsonify(wrap_data({"ids": plate_ids}))


@plasmomapper.route('/well/<int:id>/')
def get_well(id):
    return table_get_details(Well, id)


@plasmomapper.route('/well/<int:id>/recalculate-ladder/', methods=['POST'])
def recalculate_ladder(id):
    well = Well.query.get(id)
    peak_indices = request.json['peak_indices']
    print peak_indices
    if well and isinstance(peak_indices, list):
        try:
            well.calculate_base_sizes(peak_indices)
            return jsonify(wrap_data({'status': 'Success'}))
        except Exception as e:
            handle_error(e)
    else:
        res = jsonify(error="Nothing Sent")
        res.status_code = 404
        return res


@plasmomapper.route('/channel/<int:id>/')
def get_channel(id):
    return table_get_details(Channel, id)


@plasmomapper.route('/channel-annotations/<int:project_id>/locus/<int:locus_id>/')
def get_project_locus_channel_annotations(project_id, locus_id):
    channel_annotations = ProjectChannelAnnotations.query.filter(
        ProjectChannelAnnotations.project_id == project_id).join(Channel).filter(Channel.locus_id == locus_id).all()
    return jsonify(wrap_data([x.serialize() for x in channel_annotations]))


@plasmomapper.route('/channel-annotations/<int:project_id>/sample/<int:sample_id>/')
def get_project_sample_channel_annotations(project_id, sample_id):
    channel_annotations = ProjectChannelAnnotations.query.filter(
        ProjectChannelAnnotations.project_id == project_id).join(Channel).filter(Channel.sample_id == sample_id).all()
    return jsonify(wrap_data([x.serialize() for x in channel_annotations]))


@plasmomapper.route('/locus-annotations/<int:project_id>/locus/<int:locus_id>/')
def get_project_sample_locus_annotations_by_locus(project_id, locus_id):
    annotations = SampleLocusAnnotation.query.filter(
        SampleLocusAnnotation.project_id == project_id).filter(SampleLocusAnnotation.locus_id == locus_id).all()
    return jsonify(wrap_data([x.serialize() for x in annotations]))


@plasmomapper.route('/locus-annotations/<int:project_id>/sample/<int:sample_id>/')
def get_project_sample_locus_annotations_by_sample(project_id, sample_id):
    annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).filter(
        SampleLocusAnnotation.project_id == project_id).filter(ProjectSampleAnnotations.sample_id == sample_id).all()
    return jsonify(wrap_data([x.serialize() for x in annotations]))


@plasmomapper.route('/locus-annotations/', methods=['POST'])
def update_locus_annotations():
    annotations = request.json
    try:
        for annotation in annotations:
            sample_annotation = SampleLocusAnnotation.query.get(annotation['id'])
            assert isinstance(sample_annotation, SampleLocusAnnotation)
            sample_annotation.alleles = annotation['alleles']
            sample_annotation.flags['manual_curation'] = True
        db.session.commit()
        return jsonify(wrap_data({'status': 'Success'}))
    except Exception as e:
        return handle_error(e)
