import csv
import tempfile
import os
import io

from flask import request, jsonify, copy_current_request_context
from sqlalchemy import exists
from sqlalchemy.orm import defer

from app import socketio, db
from app.microspat.fsa_tools.PlateExtractor import ExtractedPlate
from app.microspat.schemas import PlateSchema, PlateListSchema, WellSchema, WellListSchema, ChannelListSchema
from app.microspat.models import Plate, Well, Channel, Ladder, ProjectChannelAnnotations, Sample, Locus, \
    GenotypingProject, LocusSet, locus_set_association_table, ProjectSampleAnnotations, ProjectLocusParams, Project
from app.microspat.api import microspat_api

from app.microspat.events.base import (
    base_list,
    emit_get,
    base_get_updated,
    emit_list,
    extract_ids,
    make_namespace,
    table_to_string_mapping,
    TaskNotifier,
)

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

socketio.on_event('get_updated', base_get_updated(Plate, plate_schema, plate_list_schema, JSON_NAMESPACE),
                  namespace=SOCK_NAMESPACE)


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_plate(json):
    ids = extract_ids(json)
    plates = []
    wells = []
    channels = []
    for plate_id in ids:
        p = Plate.query.get(plate_id)
        if p:
            plates.append(p)
            wells += p.wells
            channels += Channel.query.options(defer('data')).join(Well).join(Plate).filter(Plate.id == plate_id).all()
        else:
            socketio.emit('get_failed', {PLATE_NAMESPACE: [plate_id]}, namespace=make_namespace(PLATE_NAMESPACE))

    well_dump = well_list_schema.dumps(wells, many=True, separators=(',', ':'))
    emit_list(WELL_NAMESPACE, well_dump)

    channel_dump = channel_list_schema.dumps(channels, many=True, separators=(',', ':'))
    emit_list(CHANNEL_NAMESPACE, channel_dump)

    plate_dump = plate_schema.dumps(plates, many=True, separators=(',', ':'))
    emit_get(PLATE_NAMESPACE, plate_dump)


@socketio.on('recalculate_ladder', namespace=SOCK_NAMESPACE)
def recalculate_ladder(json):
    task = 'recalculate_ladder'
    ladder_id = json.get('ladder_id', None)
    plate_id = json.get('plate_id', None)
    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, ladder_id=ladder_id, plate_id=plate_id)

    task_notifier.emit_task_start()

    if not ladder_id:
        task_notifier.emit_task_failure(message="Ladder Not Selected.")
        return
    if not plate_id:
        task_notifier.emit_task_failure(message="Plate Not Selected.")
        return

    ladder = Ladder.query.get(ladder_id)
    socketio.sleep()
    plate = Plate.query.get(plate_id)
    socketio.sleep()

    if not ladder:
        task_notifier.emit_task_failure(message="Ladder No Longer Exists. Reload Page.")
        return

    if not plate:
        task_notifier.emit_task_failure(message="Plate No Longer Exists. Reload Page.")
        return

    if ladder and plate:
        total_wells = len(plate.wells)
        for idx, w in enumerate(plate.wells):
            w.ladder = ladder
            w.calculate_base_sizes()
            task_notifier.emit_task_progress(
                progress={
                    'style': 'determinate',
                    'total': total_wells,
                    'current_state': idx + 1,
                    'message': 'Recalculating Ladders...'
                }
            )
    task_notifier.emit_task_success(message="Successfully Recalculated Ladder.")


@socketio.on('delete', namespace=SOCK_NAMESPACE)
def delete_plate(json):
    plate_id = json.get('plate_id', None)
    task = 'delete'
    task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, plate_id=plate_id)
    task_notifier.emit_task_start()
    plate = Plate.query.get(plate_id)
    if not plate:
        task_notifier.emit_task_failure(message='Plate Not Found.')
        return
    else:
        task_notifier.emit_task_progress(progress={
            'style': 'indeterminate',
            'total': 1,
            'current_state': 1,
            'message': f'Deleting {plate.label}'
        })
        db.session.delete(plate)
        socketio.sleep()
        task_notifier.emit_task_success(message='Deletion Complete.')
        return


@microspat_api.route('/plate/upload_plate/', methods=['POST', 'OPTIONS'])
def upload_plates():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'Success'})

    @copy_current_request_context
    def bg_upload_plates(plate_files, ladder_id):
        extracted_plates = []
        ladder = Ladder.query.get(ladder_id)
        task = 'upload_plate'
        task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, ladder_id=ladder_id)

        task_notifier.emit_task_start()

        for idx, plate_zip_file in enumerate(plate_files):
            try:
                with open(plate_zip_file, 'rb') as plate_zip:
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
                        task_notifier.emit_task_progress(progress={
                                               'style': 'determinate',
                                               'total': len(plate_files) + 2,
                                               'current_state': idx + 1,
                                               'message': f'Parsing {extracted_plate.label}...',
                                           })
                        socketio.sleep()
                    else:
                        task_notifier.emit_task_progress(progress={
                            'style': 'determinate',
                            'total': len(plate_files),
                            'current_state': idx + 1,
                            'message': f"Cannot Process {extracted_plate.label}, Already Exists In Database."
                        })
                        socketio.sleep()
            except Exception as e:
                # print("Exception Not Caught", e)
                task_notifier.emit_task_progress(progress={
                    'style': 'determinate',
                    'total': len(plate_files),
                    'current_state': idx + 1,
                    'message': f"Cannot Process {plate_zip.filename}",
                })
                socketio.sleep()
            finally:
                os.remove(plate_zip_file)

        task_notifier.emit_task_progress(progress={
            'style': 'determinate',
            'total': len(plate_files) + 2,
            'current_state': len(plate_files) + 1,
            'message': f'Saving Plate Data...',
        })
        socketio.sleep()

        submitted_plates = [Plate.from_extracted_plate(plate, ladder) for plate in extracted_plates]
        db.session.commit()

        socketio.sleep()
        task_notifier.emit_task_success(message={'ids': [plate.id for plate in submitted_plates]})
        socketio.sleep()

    plate_zips = request.files.getlist('files')
    files = []
    for f in plate_zips:
        handle, tmpfile_path = tempfile.mkstemp()
        tmpfile = os.fdopen(handle, mode='wb')
        tmpfile.write(f.stream.read())
        files.append(tmpfile_path)

    ladder_id = request.form.get('ladder_id')
    socketio.start_background_task(bg_upload_plates, files, ladder_id)
    return jsonify({'status': "Success"})


@microspat_api.route('/plate/upload_plate_map/', methods=['POST'])
def upload_plate_map():
    @copy_current_request_context
    def bg_upload_plate_map(plate_map_file, plate_id, create_non_existent_samples):
        socketio.sleep()
        task = 'upload_plate_map'
        task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE, plate_id=plate_id)
        task_notifier.emit_task_start()

        plate = Plate.query.get(plate_id)
        if not plate:
            task_notifier.emit_task_failure(message="No Plate Map Uploaded")
        else:
            plate_map = csv.DictReader(plate_map_file)
            if 'well' not in [_.lower() for _ in plate_map.fieldnames]:
                task_notifier.emit_task_failure(message="Plate Map Malformed.")
                return

            locus_labels = [_.strip() for _ in plate_map.fieldnames if _.lower() not in ['', 'well']]
            clear_plate_map(plate_id)
            stale_tracker = dict()
            plate_map = list(plate_map)
            total_steps = len(plate_map)
            for idx, entry in enumerate(plate_map):
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
                            task_notifier.emit_task_failure(
                                message=f"Sample with barcode '{sample_barcode}' does not exist."
                            )
                            db.session.rollback()
                            return

                        if not locus:
                            task_notifier.emit_task_failure(
                                message=f"Locus with label '{locus_label}' does not exist."
                            )
                            db.session.rollback()
                            return

                        projects = get_projects_with_samples(sample.id, locus.id)
                        well = plate.wells_dict[well_label]
                        channel = well.channels_dict[locus.color]
                        channel.add_locus(locus.id)
                        channel.add_sample(sample.id)
                        for project in projects:
                            if not channel_in_project(project.id, channel.id):
                                project.add_channel(channel.id)
                                if not (project.id, locus.id,) in stale_tracker:
                                    lp = ProjectLocusParams.query.filter(
                                        ProjectLocusParams.project_id == project.id
                                    ).filter(
                                        ProjectLocusParams.locus_id == locus.id
                                    ).one()

                                    lp.scanning_parameters_stale = True
                                    stale_tracker[(project.id, locus.id)] = True

                        task_notifier.emit_task_progress(
                           progress={
                               'style': 'determinate',
                               'total': total_steps,
                               'current_state': idx + 1,
                               'message': f'Processing {sample_barcode} at {locus_label}...'
                           }
                        )

            task_notifier.emit_task_success(message="Plate Map Loaded Successfully")

    plate_map_file = request.files.getlist('files')[0]
    plate_map_stream = io.StringIO(plate_map_file.stream.read().decode("utf-8"), newline=None)
    create_non_existent_samples = request.form.get('create_non_existent_samples') == 'true'
    plate_id = int(request.form.get('plate_id'))

    socketio.start_background_task(bg_upload_plate_map, plate_map_stream, plate_id, create_non_existent_samples)
    return jsonify({'status': "Success"})


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


def get_projects_with_samples(sample_id, locus_id):
    return Project.query.join(LocusSet)\
        .join(locus_set_association_table)\
        .join(Locus)\
        .join(ProjectSampleAnnotations)\
        .filter(Locus.id == locus_id)\
        .filter(ProjectSampleAnnotations.sample_id == sample_id)\
        .all()


def channel_in_project(project_id, channel_id):
    return db.session.query(
        exists()
            .where(ProjectChannelAnnotations.project_id == project_id)
            .where(ProjectChannelAnnotations.channel_id == channel_id)
    ).scalar()
