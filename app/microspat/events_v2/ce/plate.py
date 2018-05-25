import csv
from collections import defaultdict

import eventlet
import os
import io
from flask import request, jsonify, session, copy_current_request_context
from sqlalchemy import exists
from sqlalchemy.orm.exc import NoResultFound

from app.microspat.fsa_tools.PlateExtractor import ExtractedPlate
from app.microspat.schemas import PlateSchema, PlateListSchema, WellSchema, WellListSchema, ChannelListSchema
from app.microspat.models import Plate, Well, Channel, Ladder, ProjectChannelAnnotations, Sample, Locus, \
    GenotypingProject, LocusSet, locus_set_association_table, ProjectSampleAnnotations, ProjectLocusParams
from app.microspat.events import microspat
from ..base import extract_ids, table_to_string_mapping, make_namespace, base_list, respond_404, emit_list, emit_get, \
    emit_task_failure, emit_task_success
from app import socketio, db

print("Loading Plate Events")

JSON_NAMESPACE = table_to_string_mapping[Plate]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

WELL_NAMESPACE = table_to_string_mapping[Well]
PLATE_NAMESPACE = table_to_string_mapping[Plate]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]

plate_schema = PlateSchema()
plate_list_schema = PlateListSchema()
well_schema = WellSchema()
well_list_schema = WellListSchema()
channel_list_schema = ChannelListSchema()

plate_list_query = Plate.get_serialized_list
socketio.on_event('list', base_list(Plate, plate_list_schema, JSON_NAMESPACE, query=plate_list_query),
                  namespace=SOCK_NAMESPACE)


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_plate(json):
    ids = extract_ids(json)
    print("Received Get req for plate {}".format(ids))
    for plate_id in ids:
        p = Plate.query.get(plate_id)
        if p:
            wells = p.wells
            well_dump = well_list_schema.dumps(wells, many=True, separators=(',', ':'))
            emit_list(WELL_NAMESPACE, well_dump)

            channels = Channel.query.join(Well).join(Plate).filter(Plate.id == plate_id).all()
            channel_dump = channel_list_schema.dumps(channels, many=True, separators=(',', ':'))
            emit_list(CHANNEL_NAMESPACE, channel_dump)

            plate_dump = plate_schema.dumps([p], many=True, separators=(',', ':'))
            emit_get(PLATE_NAMESPACE, plate_dump)


@socketio.on('recalculate_ladder', namespace=SOCK_NAMESPACE)
def recalculate_ladder(json):
    ladder_id = json.get('ladder_id', None)
    plate_id = json.get('plate_id', None)

    if not ladder_id:
        emit_task_failure('recalculate_ladder', "Ladder Not Selected", SOCK_NAMESPACE)
    if not plate_id:
        emit_task_failure('recalculate_ladder', "Plate Not Selected", SOCK_NAMESPACE)

    ladder = Ladder.query.get(ladder_id)
    eventlet.sleep()
    plate = Plate.query.get(plate_id)
    eventlet.sleep()

    if not ladder:
        emit_task_failure('recalculate_ladder', "Ladder Not Selected", SOCK_NAMESPACE)
    if not plate:
        emit_task_failure('recalculate_ladder', "Plate Not Selected", SOCK_NAMESPACE)

    if ladder and plate:
        for w in plate.wells:
            w.ladder = ladder
            w.calculate_base_sizes()
            eventlet.sleep()
    emit_task_success('recalculate_ladder', "Ladder Recalculated Successfully", SOCK_NAMESPACE)


def plate_hash_already_exists(plate_hash):
    return bool(Plate.query.filter(Plate.plate_hash == plate_hash).count())


def clear_plate_map(plate_id):
    channel_annotations = ProjectChannelAnnotations.query.join(Channel). \
        join(Well).join(Plate).filter(Plate.id == plate_id).all()
    for ca in channel_annotations:
        socketio.sleep()
        ca.reinitialize()

    channels = Channel.query.join(Well).join(Plate).filter(Plate.id == plate_id).all()
    for ch in channels:
        socketio.sleep()
        ch.reinitialize()

    # db.session.flush()

def get_genotyping_projects_with_samples(sample_id, locus_id):
    project_ids = list(
        GenotypingProject.query
            .join(LocusSet)
            .join(locus_set_association_table)
            .join(Locus).join(ProjectSampleAnnotations)
            .filter(Locus.id == locus_id)
            .filter(ProjectSampleAnnotations.sample_id == sample_id)
            .values(GenotypingProject.id)
    )
    return [_[0] for _ in project_ids]


def channel_in_project(project_id, channel_id):
    return db.session.query(
        exists()
            .where(ProjectChannelAnnotations.project_id == project_id)
            .where(ProjectChannelAnnotations.channel_id == channel_id)
    ).scalar()

@microspat.route('/plate/upload_plate/', methods=['POST'])
def upload_plates():
    @copy_current_request_context
    def bg_upload_plates(plate_files, ladder_id):
        extracted_plates = []
        ladder = Ladder.query.get(ladder_id)
        for plate_zip in plate_files:
            extracted_plate = ExtractedPlate.from_zip_and_calculate_base_sizes(
                zip_file=plate_zip,
                ladder=ladder.base_sizes,
                color=ladder.color,
                base_size_precision=ladder.base_size_precision,
                sq_limit=ladder.sq_limit,
                filter_parameters=ladder.filter_parameters,
                scanning_parameters=ladder.scanning_parameters
            )
            if not plate_hash_already_exists(extracted_plate.plate_hash):
                extracted_plates.append(extracted_plate)
                socketio.sleep()
            else:
                emit_task_failure(
                    'upload_plates',
                    f'A plate with the same hash as {extracted_plate.label} already exists.',
                    SOCK_NAMESPACE
                )
        submitted_plates = [Plate.from_extracted_plate(plate, ladder) for plate in extracted_plates]
        emit_task_success("upload_plates",
                          message={'ids': [plate.id for plate in submitted_plates]},
                          namespace=SOCK_NAMESPACE)

    plate_zips = request.files.getlist('files')
    ladder_id = request.form.get('ladder_id')
    socketio.start_background_task(bg_upload_plates, plate_zips, ladder_id)
    print("Sending Response")
    return jsonify({'status': "Success"})


@microspat.route('/plate/upload_plate_map/',  methods=['POST'])
def upload_plate_map():
    @copy_current_request_context
    def bg_upload_plate_map(plate_map_file, plate_id, create_non_existent_samples):
        socketio.sleep()
        plate = Plate.query.get(plate_id)
        if not plate:
            emit_task_failure('upload_plate_map', "No Plate Map Uploaded", SOCK_NAMESPACE)
        else:
            plate_map = csv.DictReader(plate_map_file)
            locus_labels = [_ for _ in plate_map.fieldnames if _.lower() not in ['', 'well']]
            clear_plate_map(plate_id)
            stale_tracker = dict()
            for entry in plate_map:
                socketio.sleep()
                well_label = entry['Well'].strip()
                for locus_label in locus_labels:
                    socketio.sleep()
                    sample_barcode = entry[locus_label].strip()
                    if sample_barcode:
                        sample = Sample.query.filter(Sample.barcode == sample_barcode).one_or_none()
                        locus = Locus.query.filter(Locus.label == locus_label).one_or_none()

                        if not sample and create_non_existent_samples:
                            sample = Sample(barcode=sample_barcode, designation='sample')
                            db.session.add(sample)

                        if not sample:
                            emit_task_failure('upload_plate_map',
                                              f"Sample with barcode {sample_barcode} does not exist.",
                                              SOCK_NAMESPACE)
                            db.session.rollback()
                            return

                        if not locus:
                            emit_task_failure('upload_plate_map',
                                              f"Locus with label {locus_label} does not exist.",
                                              SOCK_NAMESPACE)
                            db.session.rollback()
                            return

                        project_ids = get_genotyping_projects_with_samples(sample.id, locus.id)
                        well = plate.wells_dict[well_label]
                        channel = well.channels_dict[locus.color]
                        channel.add_locus(locus.id)
                        channel.add_sample(sample.id)
                        for project_id in project_ids:
                            if not channel_in_project(project_id, channel.id):
                                if not (project_id, locus.id,) in stale_tracker:
                                    lp = ProjectLocusParams.query.filter(
                                        ProjectLocusParams.project_id == project_id
                                    ).filter(
                                        ProjectLocusParams.locus_id == locus.id
                                    ).one()

                                    lp.scanning_parameters_stale = True
                                    stale_tracker[(project_id, locus.id)] = True
            emit_task_success('upload_plate_map', message='', namespace=SOCK_NAMESPACE)

    plate_map_file = request.files.getlist('files')[0]
    plate_map_stream = io.StringIO(plate_map_file.stream.read().decode("utf-8"), newline=None)
    create_non_existent_samples = request.form.get('create_nonexistent_samples') == 'true'
    plate_id = int(request.form.get('plate_id'))

    socketio.start_background_task(bg_upload_plate_map, plate_map_stream, plate_id, create_non_existent_samples)
    return jsonify({'status': "Success"})







#@microspat.route('/plate/upload_plate_map/', methods=['POST'])
def upload_plate_map_old():
    plate_map_file = request.files.getlist('files', [None])[0]
    create_non_existant_samples = request.form.get('create_non_existant_samples') == 'true'
    plate_id = request.form.get('plate_id')
    if plate_map_file and plate_id:
        plate = Plate.query.get(plate_id)
        if not plate:
            emit_task_failure('upload_plate_map', "No Plate Map Uploaded", SOCK_NAMESPACE)
        else:
            plate_map = csv.DictReader(plate_map_file)
            locus_labels = [_ for _ in plate_map.fieldnames if _.lower() not in ['', 'well']]
            new_channels = defaultdict(list)
            clear_plate_map(plate.id)
            stale_tracker = {}
            for entry in plate_map:
                well_label = entry['Well'].strip()
                for locus_label in locus_labels:
                    sample_barcode = entry[locus_label].strip()
                    if sample_barcode:
                        sample = Sample.query.filter(Sample.barcode == sample_barcode).one_or_none()
                        if not sample and create_non_existant_samples:
                            sample = Sample(barcode=sample_barcode, designation='sample')
                            db.session.add(sample)
                        if not sample:
                            emit_task_failure('upload_plate_map',
                                              "Sample with barcode {} does not exist".format(sample_barcode),
                                              SOCK_NAMESPACE)
                            return jsonify({'status': 'Failure'})
                        try:
                            locus = Locus.query.filter(Locus.label == locus_label).one()
                        except NoResultFound:
                            emit_task_failure('upload_plate_map',
                                              "Locus with label {} does not exist".format(locus_label))
                            return jsonify({'status': 'Failure'})

                        project_ids = list(
                            GenotypingProject.query
                                .join(LocusSet)
                                .join(locus_set_association_table)
                                .join(Locus).join(ProjectSampleAnnotations)
                                .filter(Locus.id == locus.id)
                                .filter(ProjectSampleAnnotations.sample_id == sample.id)
                                .values(GenotypingProject.id)
                        )
                        project_ids = [_[0] for _ in project_ids]
                        well = plate.wells_dict[well_label]
                        channel = well.channels_dict[locus.color]
                        channel.add_locus(locus.id)
                        channel.add_sample(sample.id)
                        for project_id in project_ids:
                            if not db.session.query(
                                    exists().where(ProjectChannelAnnotations.project_id == project_id).where(
                                        ProjectChannelAnnotations.channel_id == channel.id)).scalar():
                                new_channels[project_id].append(channel.id)

                            if not (project_id, locus.id,) in stale_tracker:
                                lp = ProjectLocusParams.query.filter(
                                    ProjectLocusParams.project_id == project_id).filter(
                                    ProjectLocusParams.locus_id == locus.id).one()
                                lp.scanning_parameters_stale = True
                                stale_tracker[(project_id, locus.id)] = True
