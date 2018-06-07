"""
    MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
    Copyright (C) 2016  Maxwell Murphy

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
"""


import csv
import os
import tempfile
import uuid
from collections import defaultdict

import eventlet
from flask import Blueprint, jsonify, request, session
from flask import current_app as app
from flask import json, send_file
from sqlalchemy import exists
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import subqueryload, joinedload
from sqlalchemy.orm.exc import NoResultFound
from werkzeug.datastructures import FileStorage


from app import socketio, db
from app.microspat.models import *
from app.microspat.models.locus.exceptions import LocusException
from app.microspat.models.quantification_bias_estimator.project import load_samples_and_controls_from_csv
from app.microspat.utils import load_plate_zips
from app.utils import CaseInsensitiveDictReader


microspat = Blueprint('microspat', import_name=__name__, template_folder='templates',
                      url_prefix='/microspat/api/v1')


class StaleParametersError(Exception):
    def __init__(self, project, locus):
        self.project = project
        self.locus = locus


@microspat.after_request
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
    res = jsonify(error=e.orig.args[0])
    res.status_code = 400
    return res


def handle_error(e):
    app.logger.debug("ERROR: {}".format(e))
    print(e)
    db.session.rollback()
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

    # if target.project.bin_estimator_id:
    #     bin_estimator = target.project.bin_estimator
    #     lp = bin_estimator.get_locus_parameters(target.locus_id)
    #     assert isinstance(lp, BinEstimatorLocusParams)
    #     if lp.filter_parameters_stale or lp.scanning_parameters_stale or lp.bin_estimator_parameters_stale:
    #         raise StaleParametersError(bin_estimator, target.locus)

    update_locus_params(target, update_dict)
    target.max_secondary_relative_peak_height = update_dict['max_secondary_relative_peak_height']
    target.min_artifact_peak_frequency = update_dict['min_artifact_peak_frequency']
    return target


def update_genotyping_locus_params(target, update_dict):
    """
    :type target: GenotypingLocusParams
    """

    if target.project.bin_estimator_id:
        bin_estimator = target.project.bin_estimator
        lp = bin_estimator.get_locus_parameters(target.locus_id)
        assert isinstance(lp, BinEstimatorLocusParams)
        if lp.filter_parameters_stale or lp.scanning_parameters_stale or lp.bin_estimator_parameters_stale:
            raise StaleParametersError(bin_estimator, target.locus)

    if target.project.artifact_estimator_id:
        artifact_estimator = target.project.artifact_estimator
        lp = artifact_estimator.get_locus_parameters(target.locus_id)
        assert isinstance(lp, ArtifactEstimatorLocusParams)
        if lp.filter_parameters_stale or lp.scanning_parameters_stale or lp.artifact_estimator_parameters_stale:
            raise StaleParametersError(artifact_estimator, target.locus)

    update_locus_params(target, update_dict)
    target.soft_artifact_sd_limit = update_dict['soft_artifact_sd_limit']
    target.hard_artifact_sd_limit = update_dict['hard_artifact_sd_limit']
    target.offscale_threshold = update_dict['offscale_threshold']
    target.bleedthrough_filter_limit = update_dict['bleedthrough_filter_limit']
    target.crosstalk_filter_limit = update_dict['crosstalk_filter_limit']
    target.relative_peak_height_limit = update_dict['relative_peak_height_limit']
    target.absolute_peak_height_limit = update_dict['absolute_peak_height_limit']
    target.failure_threshold = update_dict['failure_threshold']
    target.bootstrap_probability_threshold = update_dict['bootstrap_probability_threshold']
    target.probability_threshold = update_dict['probability_threshold']
    return target


def update_quantification_bias_estimator_locus_params(target, update_dict):
    """
    :type target: QuantificationBiasEstimatorLocusParams
    """
    if target.project.bin_estimator_id:
        bin_estimator = target.project.bin_estimator
        lp = bin_estimator.get_locus_parameters(target.locus_id)
        assert isinstance(lp, BinEstimatorLocusParams)
        if lp.filter_parameters_stale or lp.scanning_parameters_stale or lp.bin_estimator_parameters_stale:
            raise StaleParametersError(bin_estimator, target.locus)

    update_locus_params(target, update_dict)
    target.offscale_threshold = update_dict['offscale_threshold']
    target.min_bias_quantifier_peak_height = update_dict['min_bias_quantifier_peak_height']
    target.min_bias_quantifier_peak_proportion = update_dict['min_bias_quantifier_peak_proportion']
    return target


def update_project(target, update_dict):
    target.title = update_dict['title']
    target.creator = update_dict['creator']
    target.description = update_dict['description']
    return target


def load_plate_map(plate_map_file, plate, create_samples_if_not_exist=False):
    r = csv.DictReader(plate_map_file)
    locus_labels = r.fieldnames
    locus_labels = [x for x in locus_labels if x.lower() not in ['', 'well']]
    new_channels = defaultdict(list)
    clear_plate_map(plate.id)
    stale_tracker = {}
    for entry in r:
        socketio.sleep()
        well_label = entry['Well'].strip()
        for locus_label in locus_labels:
            sample_barcode = entry[locus_label]
            if sample_barcode:
                sample = Sample.query.filter(Sample.barcode == sample_barcode).one_or_none()
                if not sample and create_samples_if_not_exist:
                    if 'ntc' in sample_barcode.lower():
                        sample = Sample(barcode=sample_barcode, designation='negative_control')
                    else:
                        sample = Sample(barcode=sample_barcode, designation='sample')
                    db.session.add(sample)
                if not sample:
                    return handle_error("Sample with barcode {} does not exist".format(sample_barcode))
                try:
                    locus = Locus.query.filter(Locus.label == locus_label).one()
                except NoResultFound:
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
                    if not db.session.query(exists().where(ProjectChannelAnnotations.project_id == project_id).where(
                                    ProjectChannelAnnotations.channel_id == channel.id)).scalar():
                        new_channels[project_id].append(channel.id)

                    if not (project_id, locus.id,) in stale_tracker:
                        lp = ProjectLocusParams.query.filter(ProjectLocusParams.project_id == project_id).filter(
                            ProjectLocusParams.locus_id == locus.id).one()
                        lp.scanning_parameters_stale = True
                        stale_tracker[(project_id, locus.id)] = True

    db.session.flush()
    plate.check_contamination()
    for project_id in list(new_channels):
        project = Project.query.get(project_id)
        project.add_channels(new_channels[project_id])
    db.session.commit()
    plate = Plate.query.get(plate.id)
    return jsonify(wrap_data(plate.serialize()))


def clear_plate_map(plate_id):
    channel_annotations = ProjectChannelAnnotations.query.join(Channel).join(Well).join(Plate).filter(
        Plate.id == plate_id).all()
    for annotation in channel_annotations:
        # db.session.delete(annotation)
        annotation.reinitialize()

    channels = Channel.query.join(Well).join(Plate).filter(Plate.id == plate_id).all()
    for channel in channels:
        channel.reinitialize()

    db.session.flush()


def send_message(msg):
    socketio.emit('message', {'message': msg}, namespace='/')


@microspat.route('/', defaults={'path': ''})
@microspat.route('/<path:path>')
def catch_all(path):
    res = jsonify(error='Not Found')
    res.status_code = 404
    return res


connect_count = 0


@socketio.on('connect')
def test_message(message=None):
    global connect_count
    connect_count += 1
    if not session.get('uid'):
        session['uid'] = uuid.uuid4()
        print("Session is: {}".format(session['uid']))
    else:
        print("Session Set: {}".format(session['uid']))
    print("Total Connection Events: {}".format(connect_count))
    socketio.emit('connect', request.sid + ' Connected', broadcast=True)


@socketio.on('disconnect')
def disconnect(message=None):
    print("Disconnected...")



# @socketio.on('client_test')
# def client_test(message=None):
#     emit('server_test', 'Success')
#
#
# @socketio.on('list', namespace='/project')
# def socket_get_or_post_projects():
#     projects = GenotypingProject.query.all()
#     emit('list_all', [x.serialize() for x in projects])


def send_notification(type, message):
    socketio.emit('notification',
                  {
                      'type': type,
                      'msg': message
                  }, broadcast=True)


@microspat.route('/genotyping-project/', methods=['GET', 'POST'])
def get_or_post_genotyping_projects():
    if request.method == 'GET':
        return table_list_all(GenotypingProject)
    elif request.method == 'POST':
        project_params = json.loads(request.get_json())
        try:
            project_params['artifact_estimator_id'] = project_params.get('artifact_estimator_id') or None
            project_params['quantification_bias_estimator_id'] = project_params.get('quantification_bias_estimator_id') or None
            project_params['bin_estimator_id'] = project_params.get('bin_estimator_id') or None
            project = GenotypingProject(**project_params)
            db.session.add(project)
            db.session.flush()
            return jsonify(wrap_data(project.serialize_details()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/genotyping-project/<int:id>/get-alleles/', methods=['GET'])
def get_alleles(id):
    try:
        gp = GenotypingProject.query.get(id)
        loci = gp.locus_set.loci
        results = []

        la_dict = defaultdict(list)
        locus_annotations = SampleLocusAnnotation.query.filter(SampleLocusAnnotation.project_id == id).all()
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
    except Exception as e:
        return handle_error(e)


@microspat.route('/genotyping-project/<int:id>/get-dominant-alleles/', methods=['GET'])
def get_dominant_alleles(id):
    try:
        gp = GenotypingProject.query.get(id)
        loci = gp.locus_set.loci
        results = []

        la_dict = defaultdict(list)
        locus_annotations = SampleLocusAnnotation.query.filter(SampleLocusAnnotation.project_id == id).all()
        for locus_annotation in locus_annotations:
            la_dict[locus_annotation.sample_annotations_id].append(locus_annotation)

        sample_annotations_ids = ProjectSampleAnnotations.query.filter(
            ProjectSampleAnnotations.project_id == id).values(
            ProjectSampleAnnotations.id)

        sample_ids = dict(ProjectSampleAnnotations.query.distinct().join(Sample).filter(
            ProjectSampleAnnotations.project_id == id).values(ProjectSampleAnnotations.id, Sample.barcode))

        header = ["Sample"] + [_.label for _ in loci]

        for sa_id in sample_annotations_ids:
            sa_id = sa_id[0]
            sample_res = dict()
            sample_res['Sample'] = sample_ids[sa_id]
            for la in la_dict[sa_id]:
                max_peak = None
                peak_alleles = []
                alleles = la.alleles.items()
                bin_ids = [x[0] for x in alleles if x[1]]
                try:
                    bin_ids.remove("None")
                except ValueError:
                    pass
                called_bin_ids = [int(bin_id) for bin_id in bin_ids]
                peaks = [peak for peak in la.annotated_peaks if
                         peak['bin_id'] and int(peak['bin_id']) in called_bin_ids]
                for peak in peaks:
                    if not max_peak:
                        max_peak = peak
                    elif peak['peak_height'] > max_peak['peak_height']:
                        max_peak = peak
                if max_peak:
                    peak_alleles = [str(max_peak['bin'])]
                if peak_alleles:
                    sample_res[la.locus.label] = ";".join(peak_alleles)
            results.append(sample_res)
        handle, temp_path = tempfile.mkstemp()
        with open(temp_path, 'w') as f:
            w = csv.DictWriter(f, fieldnames=header)
            w.writeheader()
            w.writerows(results)
        return send_file(temp_path, as_attachment=True, attachment_filename="{} Dominant Peaks.csv".format(gp.title))
    except Exception as e:
        return handle_error(e)


@microspat.route('/genotyping-project/<int:id>/get-peak-data/', methods=['GET'])
def get_genotyping_peak_data(id):
    try:
        gp_title = GenotypingProject.query.filter(GenotypingProject.id == id).value(GenotypingProject.title)
        results = []
        header = ["Sample", "Locus", "Peak Height", "Relative Peak Height", "Corrected Proportion", "Peak Size",
                  "Peak Area", "Left Tail",
                  "Right Tail", "Artifact Contribution", "Artifact Error", "In Bin", "Called Allele", "Allele Label",
                  "Bleedthrough Ratio", "Crosstalk Ratio", "Probability", "Well", "Artifact Flag",
                  "Below Relative Threshold Flag", "Bleedthrough Flag", "Crosstalk Flag"]
        locus_annotations = SampleLocusAnnotation.query.filter(SampleLocusAnnotation.project_id == id).join(
            SampleLocusAnnotation.locus).join(ProjectChannelAnnotations).join(Channel).join(Well).values(
            SampleLocusAnnotation.annotated_peaks, SampleLocusAnnotation.sample_annotations_id, Locus.label,
            Well.well_label, SampleLocusAnnotation.alleles, SampleLocusAnnotation.flags)
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
                    if 'probability' in peak:
                        res["Probability"] = peak['probability']
                    results.append(res)
        handle, temp_path = tempfile.mkstemp()
        print(temp_path)
        with open(temp_path, 'w') as f:
            w = csv.DictWriter(f, fieldnames=header)
            w.writeheader()
            w.writerows(results)
        return send_file(temp_path, as_attachment=True, attachment_filename="{} Peak Data.csv".format(gp_title))
    except Exception as e:
        return handle_error(e)


@microspat.route('/quantification-bias-estimator-project/<int:id>/get-peak-data/', methods=['GET'])
def get_quantification_bias_estimator_peak_data(id):
    try:
        qbe_title = QuantificationBiasEstimatorProject.query.filter(QuantificationBiasEstimatorProject.id == id).value(
            QuantificationBiasEstimatorProject.title)
        results = []
        header = ["Sample", "Locus", "Peak Height", "Relative Peak Height", "True Proportion", "Proportion",
                  "Corrected Proportion", "Peak Size",
                  "Peak Area", "Left Tail", "Right Tail", "Artifact Contribution", "Artifact Error", "In Bin",
                  "Called Allele", "Allele Label", "Bleedthrough Ratio", "Crosstalk Ratio", "Well"]
        locus_annotations = SampleLocusAnnotation.query.filter(SampleLocusAnnotation.project_id == id).join(
            SampleLocusAnnotation.locus).join(ProjectChannelAnnotations).join(Channel).join(Well).values(
            SampleLocusAnnotation.annotated_peaks, SampleLocusAnnotation.sample_annotations_id, Locus.label,
            Well.well_label, SampleLocusAnnotation.alleles)
        sample_ids = dict(ProjectSampleAnnotations.query.distinct().join(Sample).filter(
            ProjectSampleAnnotations.project_id == id).values(ProjectSampleAnnotations.id, Sample.barcode))
        for la in locus_annotations:
            alleles = la[4].items()
            bin_ids = [str(x[0]) for x in alleles if x[1]]
            for peak in la[0]:
                res = dict()
                res["Sample"] = sample_ids[la[1]]
                res["Locus"] = la[2]
                res["Peak Height"] = peak['peak_height']
                res["Relative Peak Height"] = peak['relative_peak_height']
                res["Proportion"] = peak.get('relative_quantification', 'NA')
                res["Corrected Proportion"] = peak.get('corrected_relative_quantification', 'NA')
                res["True Proportion"] = peak.get('true_proportion', 'NA')
                res["Peak Size"] = peak['peak_size']
                res["Peak Area"] = peak['peak_area']
                res["Left Tail"] = peak['left_tail']
                res["Right Tail"] = peak['right_tail']
                res["Artifact Contribution"] = peak.get('artifact_contribution', 'NA')
                res["Artifact Error"] = peak.get('artifact_error', 'NA')
                res["In Bin"] = bool(peak['bin_id'])
                if res["In Bin"]:
                    res["Called Allele"] = str(peak['bin_id']) in bin_ids
                    res["Allele Label"] = str(peak['bin'])
                res["Bleedthrough Ratio"] = peak['bleedthrough_ratio']
                res["Crosstalk Ratio"] = peak['crosstalk_ratio']
                res["Well"] = la[3]
                if 'probability' in peak:
                    res["Probability"] = peak['probability']
                results.append(res)
        handle, temp_path = tempfile.mkstemp()
        with open(temp_path, 'w') as f:
            w = csv.DictWriter(f, fieldnames=header)
            w.writeheader()
            w.writerows(results)
        return send_file(temp_path, as_attachment=True, attachment_filename="{} Peak Data.csv".format(qbe_title))

    except Exception as e:
        return handle_error(e)


@microspat.route('/genotyping-project/calculate-probability/', methods=['POST'])
def calculate_probability():
    project_json = json.loads(request.get_json())
    project = GenotypingProject.query.get(project_json['id'])
    assert isinstance(project, GenotypingProject)
    project.annotate_peak_probability()
    db.session.commit()
    return jsonify(wrap_data(project.serialize_details()))


@microspat.route('/genotyping-project/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_or_update_genotyping_project(id):
    if request.method == 'GET':
        return table_get_details(GenotypingProject, id)
    elif request.method == 'PUT':
        project_update_dict = json.loads(request.get_json())
        project = GenotypingProject.query.get(id)
        if project:
            try:
                project = update_project(project, project_update_dict)
                db.session.commit()
                return jsonify(wrap_data(project.serialize_details()))
            except Exception as e:
                return handle_error(e)
        else:
            err = "Uh Oh, Project Doesn't Exist"
            return handle_error(err)
    elif request.method == 'DELETE':
        try:
            gp = GenotypingProject.query.filter(GenotypingProject.id == id).first()
            db.session.delete(gp)
            return jsonify(wrap_data({"id": id}))
        except Exception as e:
            return handle_error(e)


def get_sample_ids_from_csv(f):
    """
    Takes barcodes listed in a csv file and returns an array of IDs of the corresponding samples
    :param f: csv file with header ['barcode']
    :return: sample_id[]
    """
    assert isinstance(f, FileStorage)
    sample_ids = set()
    if f.filename[-4:] != '.csv':
        raise ValueError("Uploaded file is not a csv.")

    try:
        r = CaseInsensitiveDictReader(f)

        if 'barcode' not in r.fieldnames:
            raise ValueError("File header not valid")

        for sample_entry in r:
            sample_id = Sample.query.filter(Sample.barcode == sample_entry['barcode']).value(Sample.id)
            if not sample_id:
                raise ValueError("{} Does not yet exist.".format(sample_entry))
            sample_ids.add(sample_id)
    except csv.Error:
        raise ValueError("File is not valid.")

    return sample_ids


@microspat.route('/genotyping-project/<int:id>/add-samples/', methods=['POST'])
def genotyping_project_add_samples(id):
    gp = GenotypingProject.query.get(id)
    assert isinstance(gp, GenotypingProject)
    files = request.files.getlist('files')

    if not files:
        return handle_error("Nothing Uploaded")
    try:
        full_sample_ids = set()
        for sample_file in files:
            sample_ids = get_sample_ids_from_csv(sample_file)
            for sample_id in sample_ids:
                full_sample_ids.add(sample_id)
            # full_sample_ids.add(get_sample_ids_from_csv(sample_file))
        gp.add_samples(list(full_sample_ids))
        return jsonify(wrap_data(gp.serialize_details()))
    except ValueError as e:
        return handle_error(e)


@microspat.route('/quantification-bias-estimator-project/', methods=['GET', 'POST'])
def get_or_post_bias_estimator_projects():
    if request.method == 'GET':
        return table_list_all(QuantificationBiasEstimatorProject)
    elif request.method == 'POST':
        project_params = json.loads(request.get_json())
        try:
            project = QuantificationBiasEstimatorProject(**project_params)
            db.session.add(project)
            db.session.flush()
            return jsonify(wrap_data(project.serialize_details()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/quantification-bias-estimator-project/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_or_update_bias_estimator_project(id):
    if request.method == 'GET':
        return table_get_details(QuantificationBiasEstimatorProject, id)
    elif request.method == 'PUT':
        project_update_dict = json.loads(request.get_json())
        project = QuantificationBiasEstimatorProject.query.get(id)
        if project:
            try:
                project = update_project(project, project_update_dict)
                db.session.commit()
                return jsonify(wrap_data(project.serialize_details()))
            except Exception as e:
                return handle_error(e)
        else:
            err = "Uh Oh, Project Doesn't Exist"
            return handle_error(err)
    elif request.method == 'DELETE':
        try:
            QuantificationBiasEstimatorProject.query.filter(QuantificationBiasEstimatorProject.id == id).delete()
            return jsonify(wrap_data({"id": id}))
        except Exception as e:
            return handle_error(e)


@microspat.route('/quantification-bias-estimator-project/<int:id>/add-samples/', methods=['POST'])
def quantification_bias_estimator_project_add_samples(id):
    qbe = QuantificationBiasEstimatorProject.query.get(id)
    assert isinstance(qbe, QuantificationBiasEstimatorProject)

    files = request.files.getlist('files')
    if not files:
        return handle_error("Nothing Uploaded")

    for sample_file in files:
        try:
            load_samples_and_controls_from_csv(sample_file, qbe.id)
        except Exception as e:
            return handle_error("Cannot process file, make sure it's a csv.")
    return jsonify(wrap_data(qbe.serialize_details()))


@microspat.route('/artifact-estimator-project/', methods=['GET', 'POST'])
def get_or_create_artifact_estimators():
    if request.method == 'GET':
        return table_list_all(ArtifactEstimatorProject)
    elif request.method == 'POST':
        project_params = json.loads(request.get_json())
        try:
            if 'bin_estimator_id' in project_params:
                project_params.pop('bin_estimator_id')
            project = ArtifactEstimatorProject(**project_params)
            db.session.add(project)
            db.session.flush()
            # project.initialize_project()
            return jsonify(wrap_data(project.serialize_details()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/artifact-estimator-project/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_or_update_artifact_estimator(id):
    if request.method == 'GET':
        q = ArtifactEstimatorProject.query.filter(ArtifactEstimatorProject.id == id)
        q.options(subqueryload(ArtifactEstimatorProject.locus_parameters),
                  subqueryload(ArtifactEstimatorProject.locus_artifact_estimators)
                  .subqueryload(LocusArtifactEstimator.artifact_estimators)
                  .subqueryload(ArtifactEstimator.artifact_equations)).order_by(ArtifactEstimatorProject.id)
        ae = q.first()
        res = wrap_data(ae.serialize_details())
        # res = table_get_details(ArtifactEstimatorProject, id)
        return jsonify(res)
    elif request.method == 'PUT':
        project_update_dict = json.loads(request.get_json())
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


@microspat.route('/artifact-estimator-project/<int:id>/set-samples/', methods=['POST'])
def set_artifact_estimator_samples(id):
    ae = ArtifactEstimatorProject.query.get(id)
    assert isinstance(ae, ArtifactEstimatorProject)
    files = request.files.getlist('files')

    if not files:
        return handle_error("Nothing Uploaded")
    try:
        full_sample_ids = set()
        for sample_file in files:
            full_sample_ids.add(get_sample_ids_from_csv(sample_file))
            ae.set_samples(full_sample_ids)
        return get_artifact_estimator_samples(id)
    except ValueError as e:
        return handle_error(e)


@microspat.route('/artifact-estimator-project/<int:id>/get-samples/', methods=['GET'])
def get_artifact_estimator_samples(id):
    samples = Sample.query.join(Channel).join(ProjectChannelAnnotations).join(Project).filter(
        Project.id == id).distinct(Sample.id).values(Sample.id, Sample.barcode, Sample.last_updated)
    samples = [{'id': _[0],
                'barcode': _[1],
                'last_updated': _[2]
                } for _ in samples]
    return jsonify(wrap_data(samples))


@microspat.route('/artifact-estimator/<int:id>/', methods=['DELETE'])
def delete_artifact_estimator(id):
    try:
        estimator = ArtifactEstimator.query.get(id)
        assert isinstance(estimator, ArtifactEstimator)
        if not estimator.is_global:
            global_estimator = ArtifactEstimator.query.filter(
                ArtifactEstimator.label == ArtifactEstimator.GLOBAL_ESTIMATOR).filter(
                ArtifactEstimator.locus_artifact_estimator_id == estimator.locus_artifact_estimator_id).first()
            if global_estimator:
                assert isinstance(global_estimator, ArtifactEstimator)
                peak_data = estimator.peak_data
                global_estimator.peak_data += peak_data
                global_estimator.peak_data.changed()
                global_estimator.clear_breakpoints()

        genotyping_projects = GenotypingProject.query.filter(
            GenotypingProject.artifact_estimator_id == estimator.locus_artifact_estimator.project.id).all()
        locus_id = estimator.locus_artifact_estimator.locus_id
        for project in genotyping_projects:
            project.artifact_estimator_changed(locus_id)
        db.session.delete(estimator)
        estimators = ArtifactEstimator.query.filter(
            ArtifactEstimator.locus_artifact_estimator_id == estimator.locus_artifact_estimator_id).all()
        return jsonify(wrap_data([_.serialize() for _ in estimators]))
    except Exception as e:
        return handle_error(e)


@microspat.route('/artifact-estimator/<int:id>/', methods=['POST'])
def add_breakpoint(id):
    try:
        estimator = ArtifactEstimator.query.get(id)
        assert isinstance(estimator, ArtifactEstimator)
        request_json = request.get_json()
        breakpoint = float(request_json['breakpoint'])
        estimator.add_breakpoint(breakpoint)

        return jsonify(wrap_data(estimator.serialize()))
    except Exception as e:
        return handle_error(e)


@microspat.route('/artifact-estimator/<int:id>/recalculate-artifact-equations/', methods=['POST'])
def recalculate_artifact_equations(id):
    estimator = ArtifactEstimator.query.get(id)
    parameter_sets = request.get_json()
    estimator.generate_estimating_equations(parameter_sets)
    return jsonify(wrap_data(estimator.serialize()))


@microspat.route('/artifact-estimator/<int:id>/clear-breakpoints/', methods=['GET'])
def clear_breakpoints(id):
    try:
        estimator = ArtifactEstimator.query.get(id)
        assert isinstance(estimator, ArtifactEstimator)
        estimator.clear_breakpoints()
        return jsonify(wrap_data(estimator.serialize()))
    except Exception as e:
        return handle_error(e)


@microspat.route('/bin-estimator/', methods=['GET', 'POST'])
def get_or_create_bin_estimators():
    if request.method == 'GET':
        return table_list_all(BinEstimatorProject)
    elif request.method == 'POST':
        project_params = json.loads(request.get_json())
        try:
            project = BinEstimatorProject(**project_params)
            db.session.add(project)
            db.session.flush()
            # project.initialize_project()
            return jsonify(wrap_data(project.serialize_details()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/bin-estimator/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_or_update_bin_estimator(id):
    if request.method == 'GET':
        q = BinEstimatorProject.query.filter(BinEstimatorProject.id == id)
        q.options(subqueryload(BinEstimatorProject.locus_parameters),
                  subqueryload(BinEstimatorProject.locus_bin_sets))
        be = q.first()
        res = wrap_data(be.serialize_details())
        return jsonify(res)
    elif request.method == 'PUT':
        project_update_dict = json.loads(request.get_json())
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
        # artifact_estimator = ArtifactEstimatorProject.query.filter(
        #     ArtifactEstimatorProject.bin_estimator_id == project.id).first()
        # if artifact_estimator:
        #     return handle_error(
        #         "Bin estimator is used in an Artifact Estimator {}. Cannot Delete.".format(artifact_estimator.title))
        try:
            db.session.delete(project)
            return jsonify(wrap_data({"status": "Success"}))
        except Exception as e:
            return handle_error(e)


# @microspat.route('/bin-estimator/<int:id>/set-samples/', methods=['POST'])
# def set_bin_estimator_samples(id):
#     be = BinEstimatorProject.query.get(id)
#     assert isinstance(be, BinEstimatorProject)
#     files = request.files.getlist('files')
#
#     if not files:
#         return handle_error("Nothing Uploaded")
#     try:
#         full_sample_ids = set()
#         for sample_file in files:
#             full_sample_ids.add(get_sample_ids_from_csv(sample_file))
#             be.set_samples(full_sample_ids)
#             return jsonify(wrap_data(be.serialize_details()))
#     except ValueError as e:
#         return handle_error(e)


@microspat.route('/bin-estimator/<int:id>/locus/<int:locus_id>/bins/', methods=['PUT', 'POST'])
def create_or_update_bins(id, locus_id):
    bins = map(json.loads, request.json)
    old_bins = filter(lambda _: _.get('id'), bins)
    new_bins = filter(lambda _: not _.get('id'), bins)

    project = BinEstimatorProject.query.get(id)
    assert isinstance(project, BinEstimatorProject)
    locus_bin_set = [_ for _ in project.locus_bin_sets if _.locus_id == locus_id][0]
    assert isinstance(locus_bin_set, LocusBinSet)

    if not locus_bin_set:
        return handle_error("Locus is not assigned to this project")

    # Remove deleted bins
    old_bin_ids = [_['id'] for _ in old_bins]
    for b in locus_bin_set.bins:
        if b.id not in old_bin_ids:
            db.session.delete(b)

    # Update old bins
    for b in old_bins:
        old_bin = [_ for _ in locus_bin_set.bins if _.id == b['id']][0]
        assert isinstance(old_bin, Bin)
        old_bin.base_size = b['base_size']
        old_bin.bin_buffer = b['bin_buffer']
        old_bin.label = b['label']

    # Add new bins
    for b in new_bins:
        new_bin = Bin(label=b['label'], base_size=b['base_size'], bin_buffer=b['bin_buffer'])
        db.session.add(new_bin)
        locus_bin_set.bins.append(new_bin)

    db.session.flush()

    project.parameters_changed(locus_id)

    locus_parameters = project.get_locus_parameters(locus_id)

    assert isinstance(locus_parameters, BinEstimatorLocusParams)

    locus_parameters.scanning_parameters_stale = False
    locus_parameters.filter_parameters_stale = False
    locus_parameters.bin_estimator_parameters_stale = False

    return jsonify(wrap_data({"status": "Success"}))


@microspat.route('/locus-parameters/', methods=['POST'])
def batch_update_locus_parameters():
    update_fns = {
        'artifact_estimator_locus_params': update_artifact_locus_params,
        'genotyping_locus_params': update_genotyping_locus_params,
        'bin_estimator_locus_params': update_bin_estimator_locus_params,
        'quantification_bias_locus_params': update_quantification_bias_estimator_locus_params,
        'base_locus_params': update_locus_params
    }
    locus_params_update_dict = json.loads(request.get_json())
    proj_id = locus_params_update_dict['project_id']
    project = Project.query.get(proj_id)
    locus_parameters = ProjectLocusParams.query.filter(ProjectLocusParams.project_id == proj_id).all()
    if locus_parameters:
        try:
            updater = update_fns.get(locus_parameters[0].discriminator, update_locus_params)
            try:
                for p in locus_parameters:
                    updater(p, locus_params_update_dict)
            except StaleParametersError as e:
                return handle_error("{} is stale at locus {}, analyze that first!".format(e.project, e.locus))
            db.session.flush()
            for p in locus_parameters:
                send_notification('info', 'Beginning Analysis: {}'.format(p.locus.label))
                project.analyze_locus(p.locus_id)

                send_notification('success', 'Completed Analysis: {}'.format(p.locus.label))
            return jsonify(wrap_data({'Status': 'Success'}))
        except SQLAlchemyError as e:
            return handle_error(e)
    else:
        return jsonify(error="No Record Found", status=404)


@microspat.route('/locus-parameters/<int:id>/', methods=['GET', 'PUT'])
def get_or_update_locus_parameters(id):
    update_fns = {
        'artifact_estimator_locus_params': update_artifact_locus_params,
        'genotyping_locus_params': update_genotyping_locus_params,
        'bin_estimator_locus_params': update_bin_estimator_locus_params,
        'quantification_bias_locus_params': update_quantification_bias_estimator_locus_params,
        'base_locus_params': update_locus_params
    }
    if request.method == 'GET':
        return table_get_details(ProjectLocusParams, id)
    elif request.method == 'PUT':
        locus_params_update_dict = json.loads(request.get_json())
        locus_params = ProjectLocusParams.query.get(id)
        assert isinstance(locus_params, ProjectLocusParams)
        print("Getting Project...")
        project = Project.query.get(locus_params.project_id)
        print("Got Project {}".format(project.title))
        if locus_params:
            try:
                updater = update_fns.get(locus_params.discriminator, update_locus_params)
                try:
                    print("Updating Locus Params...")
                    locus_params = updater(locus_params, locus_params_update_dict)
                    print("Updated Locus Params for {}".format(locus_params.locus.label))
                except StaleParametersError as e:
                    return handle_error("{} is stale at locus {}, analyze that first!".format(e.project, e.locus))
                db.session.flush()
                send_notification('info', 'Beginning Analysis: {}'.format(locus_params.locus.label))
                print("Analyzing Locus {}...".format(locus_params.locus.label))
                project.analyze_locus(locus_params.locus_id)
                print("Done Analyzing Locus")
                send_notification('success', 'Completed Analysis: {}'.format(locus_params.locus.label))
                return jsonify(wrap_data(locus_params.serialize()))
            except SQLAlchemyError as e:
                return handle_error(e)
        else:
            return jsonify(error="No Record Found", status=404)


@microspat.route('/locus/', methods=['GET', 'POST'])
def get_or_post_loci():
    if request.method == 'GET':
        return table_list_all(Locus)
    elif request.method == 'POST':
        locus_params = json.loads(request.get_json())
        try:
            locus = Locus(**locus_params)
            db.session.add(locus)
            db.session.flush()
            return jsonify(wrap_data(locus.serialize()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/locus/from-csv/', methods=['POST'])
def load_loci_from_csv_path(f=None):
    if not f:
        locus_csv = request.files.getlist('files')[0]
    else:
        locus_csv = f
    try:
        if locus_csv.filename[-4:] != ".csv":
            return handle_error("Uploaded file is not a CSV")
        loci = load_loci_from_csv(locus_csv)
        map(db.session.add, loci)
        db.session.flush()
        return table_list_all(Locus)

    except LocusException as e:
        return handle_error(e)


@microspat.route('/locus/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
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


@microspat.route('/locus-set/', methods=['GET', 'POST'])
def get_or_post_locus_sets():
    if request.method == 'GET':
        return table_list_all(LocusSet)
    elif request.method == 'POST':
        request_json = request.get_json()
        locus_set_params = json.loads(request_json['locus_set'])
        locus_ids = request_json['locus_ids']
        try:
            locus_set = LocusSet(**locus_set_params)
            for locus_id in locus_ids:
                locus = Locus.query.get(int(locus_id))
                locus_set.loci.append(locus)
            db.session.add(locus_set)
            db.session.flush()
            return jsonify(wrap_data(locus_set.serialize()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/locus-set/<int:id>/', methods=['GET', 'DELETE'])
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


@microspat.route('/ladder/', methods=['GET', 'POST'])
def get_or_post_ladders():
    if request.method == 'GET':
        return table_list_all(Ladder)
    elif request.method == 'POST':
        ladder_params = json.loads(request.get_json())
        try:
            if ladder_params.get('id', None):
                l = Ladder.query.get(ladder_params['id'])
            else:
                l = Ladder()
            for attr in list(ladder_params):
                if hasattr(l, attr):
                    setattr(l, attr, ladder_params[attr])
            db.session.add(l)
            db.session.flush()
            return jsonify(wrap_data(l.serialize()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/ladder/<int:id>/', methods=['GET', 'PUT'])
def get_ladder(id):
    if request.method == 'GET':
        return table_get_details(Ladder, id)
    elif request.method == 'PUT':
        ladder_params = json.loads(request.get_json())
        try:
            l = Ladder.query.get(ladder_params.pop('id'))
            for attr in list(ladder_params):
                if hasattr(l, attr):
                    setattr(l, attr, ladder_params[attr])
            db.session.add(l)
            db.session.flush()
            return jsonify(wrap_data(l.serialize()))
        except Exception as e:
            return handle_error(e)


@microspat.route('/sample/', methods=['GET'])
def get_samples():
    return table_list_all(Sample)


@microspat.route('/sample/', methods=['POST'])
def post_sample_csv():
    sample_csvs = request.files.getlist('files')
    if not sample_csvs:
        return handle_error("Nothing Uploaded")
    samples = []
    try:
        for sample_csv in sample_csvs:
            if sample_csv.filename[-4:] != ".csv":
                return handle_error("Uploaded file is not a CSV")
            sample_list = load_samples_from_csv(sample_csv)
            map(db.session.add, sample_list)
            samples += sample_list
        db.session.flush()
    except Exception as e:
        return handle_error(e)

    return jsonify(wrap_data([sample.serialize() for sample in samples]))


@microspat.route('/sample/<int:id>/')
def get_sample(id):
    return table_get_details(Sample, id)


@microspat.route('/plate/', methods=['GET'])
def get_plates():
    return jsonify(wrap_data(Plate.get_serialized_list()))


@microspat.route('/plate/', methods=['POST'])
def save_plate():
    plate_zips = request.files.getlist('files')
    ladder_id = request.form['ladder_id']
    if ladder_id == 'undefined':
        res = jsonify(error="Please Select a Ladder")
        res.status_code = 404
        return res
    if plate_zips:
        try:
            files = []
            if not os.path.exists('./tmp'):
                os.mkdir('./tmp')
            for i, f in enumerate(plate_zips):
                filename = str(i)
                f.save(os.path.join('./tmp', filename))
                files.append(os.path.join('./tmp', filename))
            ladder = Ladder.query.get(ladder_id)
            plate_zips = [open(_, 'rb') for _ in files]
            try:
                if os.name in ['nt', 'posix']:  # Currently no support for multiprocessing in windows at this time.
                    extracted_plates = load_plate_zips(plate_zips, ladder, parallel=False)
                else:
                    extracted_plates = load_plate_zips(plate_zips, ladder)
            except Exception as e:
                raise e
            finally:
                for z in plate_zips:
                    z.close()
            plates = []
            for extracted_plate in extracted_plates:
                if Plate.query.filter(Plate.plate_hash == extracted_plate.plate_hash).count():
                    return handle_error(
                        "A plate with the same hash as {} already exists. Are you sure this hasn't "
                        "been loaded before?".format(extracted_plate.label))
                p = Plate(label=extracted_plate.label, comments=extracted_plate.comments,
                          creator=extracted_plate.creator,
                          date_run=extracted_plate.date_run, well_arrangement=extracted_plate.well_arrangement,
                          ce_machine=extracted_plate.ce_machine, plate_hash=extracted_plate.plate_hash,
                          current=extracted_plate.current, voltage=extracted_plate.voltage,
                          temperature=extracted_plate.temperature, power=extracted_plate.power
                          )

                db.session.add(p)

                for well in extracted_plate.wells:
                    w = Well(well_label=well.well_label, comments=well.comments, base_sizes=well.base_sizes,
                             ladder_peak_indices=well.ladder_peak_indices, sizing_quality=well.sizing_quality,
                             offscale_indices=well.offscale_indices, fsa_hash=well.fsa_hash)
                    w.plate = p
                    w.ladder = ladder
                    db.session.add(w)
                    for channel in well.channels:
                        c = Channel(wavelength=channel.wavelength, data=channel.data, color=channel.color)
                        c.well = w
                        db.session.add(c)
                plates.append(p)
            db.session.flush()
            map(lambda x: os.remove(os.path.join('./tmp', x)), os.listdir('./tmp'))
            return jsonify(wrap_data([Plate.query.get(plate.id).serialize() for plate in plates]))
        except Exception as e:
            return handle_error(e)
    else:
        res = jsonify(error="Nothing Uploaded")
        res.status_code = 404
        return res


# @microspat.route('/plate/', methods=['POST'])
# def save_plate():
#     plate_zips = request.files.getlist('files')
#     ladder_id = request.form['ladder_id']
#     if ladder_id == 'undefined':
#         res = jsonify(error="Please Select a Ladder")
#         res.status_code = 404
#         return res
#     if plate_zips:
#         try:
#             plate_ids = []
#             for plate_zip in plate_zips:
#                 p_id = Plate.from_zip(plate_zip, ladder_id)
#                 plate_ids.append(p_id)
#             db.session.expire_all()
#             return jsonify(wrap_data([Plate.query.get(plate_id).serialize() for plate_id in plate_ids]))
#         except Exception as e:
#             return handle_error(e)
#     else:
#         res = jsonify(error="Nothing Uploaded")
#         res.status_code = 404
#         return res


@microspat.route('/plate/<int:plate_id>/', methods=['DELETE'])
def delete_plate(plate_id):
    p = Plate.query.get(plate_id)
    db.session.delete(p)
    return jsonify(wrap_data({'status': 'Success'}))


@microspat.route('/plate/<int:id>/', methods=['GET', 'POST'])
def get_plate_or_post_plate_map(id):
    if request.method == 'GET':
        return table_get_details(Plate, id)
    elif request.method == 'POST':
        plate_map_list = request.files.getlist('files')
        if plate_map_list:
            try:
                plate_map = plate_map_list[0]
                plate = Plate.query.get(id)
                return load_plate_map(plate_map, plate, request.form['create_samples_if_not_exist'] == 'true')
            except Exception as e:
                return handle_error(e)
        else:
            return handle_error("Nothing Submitted")


@microspat.route('/plate/locus/<int:id>/', methods=['GET'])
def get_plates_with_locus(id):
    plate_ids = set(Plate.query.join(Well).join(Channel).filter(Channel.locus_id == id).values(Plate.id))
    return jsonify(wrap_data({"ids": plate_ids}))


@microspat.route('/plate/<int:plate_id>/recalculate-ladder/<int:ladder_id>/', methods=['GET'])
def recalculate_plate_ladder(plate_id, ladder_id):
    plate = Plate.query.get(plate_id)
    ladder = Ladder.query.get(ladder_id)
    assert isinstance(plate, Plate)
    for well in plate.wells:
        well.ladder = ladder
        well.calculate_base_sizes()
    db.session.flush()
    plate = Plate.query.get(plate_id)
    return jsonify(wrap_data(plate.serialize()))


@microspat.route('/well/<int:id>/')
def get_well(id):
    return table_get_details(Well, id)


@microspat.route('/well/<int:id>/recalculate-ladder/', methods=['POST'])
def recalculate_ladder(id):
    well = Well.query.get(id)
    request_json = request.get_json()
    peak_indices = request_json['peak_indices']
    if well and isinstance(peak_indices, list):
        try:
            well.calculate_base_sizes(peak_indices)
            for channel in well.channels:
                if channel.locus_id:
                    channel.find_max_data_point()
            return jsonify(wrap_data({'status': 'Success'}))
        except Exception as e:
            handle_error(e)
    else:
        res = jsonify(error="Nothing Sent")
        res.status_code = 404
        return res


@microspat.route('/channel/<int:id>/')
def get_channel(id):
    return table_get_details(Channel, id)


@microspat.route('/channel-annotations/<int:project_id>/locus/<int:locus_id>/')
def get_project_locus_channel_annotations(project_id, locus_id):
    channel_annotations = ProjectChannelAnnotations.query.filter(
        ProjectChannelAnnotations.project_id == project_id).join(Channel).filter(Channel.locus_id == locus_id) \
        .options(joinedload(ProjectChannelAnnotations.channel).joinedload(Channel.locus)).all()
    return jsonify(wrap_data([x.serialize() for x in channel_annotations]))


@microspat.route('/channel-annotations/<int:project_id>/sample/<int:sample_id>/')
def get_project_sample_channel_annotations(project_id, sample_id):
    channel_annotations = ProjectChannelAnnotations.query.filter(
        ProjectChannelAnnotations.project_id == project_id).join(Channel).filter(Channel.sample_id == sample_id) \
        .options(joinedload(ProjectChannelAnnotations.channel).joinedload(Channel.locus)).all()
    return jsonify(wrap_data([x.serialize() for x in channel_annotations]))


@microspat.route('/locus-annotations/<int:project_id>/locus/<int:locus_id>/')
def get_project_sample_locus_annotations_by_locus(project_id, locus_id):
    annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).filter(
        SampleLocusAnnotation.project_id == project_id).filter(SampleLocusAnnotation.locus_id == locus_id) \
        .options(joinedload(SampleLocusAnnotation.reference_run)).all()
    return jsonify(wrap_data([x.serialize() for x in annotations]))


@microspat.route('/locus-annotations/<int:project_id>/sample/<int:sample_id>/')
def get_project_sample_locus_annotations_by_sample(project_id, sample_id):
    annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).filter(
        SampleLocusAnnotation.project_id == project_id).filter(ProjectSampleAnnotations.sample_id == sample_id) \
        .options(joinedload(SampleLocusAnnotation.reference_run)).all()
    return jsonify(wrap_data([x.serialize() for x in annotations]))


@microspat.route('/locus-annotations/', methods=['POST'])
def update_locus_annotations():
    annotations = map(json.loads, request.get_json())
    for annotation in annotations:
        sample_annotation = SampleLocusAnnotation.query.get(annotation['id'])
        assert isinstance(sample_annotation, SampleLocusAnnotation)
        sample_annotation.alleles = annotation['alleles']
        sample_annotation.flags['manual_curation'] = True
    db.session.commit()
    return jsonify(wrap_data({'status': 'Success'}))


@microspat.route('/control/', methods=['GET', 'POST'])
def get_controls():
    if request.method == 'GET':
        return table_list_all(Control)
    elif request.method == 'POST':
        try:
            ctrl_info = json.loads(request.get_json())
            ctrl = Control(barcode=ctrl_info['barcode'], bin_estimator_id=ctrl_info['bin_estimator_id'])
            for k in ctrl_info['alleles'].keys():
                if ctrl_info['alleles'][k] == 'null':
                    ctrl_info['alleles'][k] = None
            ctrl.set_alleles(ctrl_info['alleles'])

            db.session.add(ctrl)
            db.session.flush()
            return jsonify(wrap_data(ctrl.serialize()))
        except Exception as e:
            handle_error(e)


@microspat.route('/control/<int:id>/', methods=['GET', 'PUT', 'DELETE'])
def get_control(id):
    if request.method == 'GET':
        return table_get_details(Control, id)
    elif request.method == 'PUT':
        try:
            ctrl = Control.query.get(id)
            update_control = json.loads(request.get_json())
            for k in update_control['alleles'].keys():
                if update_control['alleles'][k] == 'null':
                    update_control['alleles'][k] = None
            ctrl.bin_estimator_id = update_control['bin_estimator_id']
            db.session.flush()
            ctrl.initialize_alleles()
            ctrl.set_alleles(update_control['alleles'])
            db.session.flush()
            return jsonify(wrap_data(ctrl.serialize()))
        except Exception as e:
            handle_error(e)
    elif request.method == 'DELETE':
        ctrl = Control.query.get(id)
        db.session.delete(ctrl)
        db.session.flush()
        return jsonify(wrap_data({'status': 'Success'}))
