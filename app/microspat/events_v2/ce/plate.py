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
from app.microspat.api_v2 import microspat
from ..base import extract_ids, table_to_string_mapping, make_namespace, base_list, emit_list, emit_get, \
    emit_task_failure, emit_task_success, emit_task_start, generate_task_id, emit_task_progress
from app import socketio, db

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
    task = 'recalculate_ladder'
    task_id = generate_task_id()
    ladder_id = json.get('ladder_id', None)
    plate_id = json.get('plate_id', None)

    emit_task_start(task=task,
                    task_id=task_id,
                    task_args={
                        'ladder_id': ladder_id,
                        'plate_id': plate_id
                    },
                    namespace=SOCK_NAMESPACE)

    if not ladder_id:
        emit_task_failure(task=task,
                          task_id=task_id,
                          task_args={
                              'ladder_id': ladder_id,
                              'plate_id': plate_id
                          },
                          message="Ladder Not Selected.",
                          namespace=SOCK_NAMESPACE)
        return
    if not plate_id:
        emit_task_failure(task=task,
                          task_id=task_id,
                          task_args={
                              'ladder_id': ladder_id,
                              'plate_id': plate_id
                          },
                          message="Plate Not Selected.",
                          namespace=SOCK_NAMESPACE)
        return

    ladder = Ladder.query.get(ladder_id)
    socketio.sleep()
    plate = Plate.query.get(plate_id)
    socketio.sleep()

    if not ladder:
        emit_task_failure(task=task,
                          task_id=task_id,
                          task_args={
                              'ladder_id': ladder_id,
                              'plate_id': plate_id
                          },
                          message="Ladder No Longer Exists. Reload Page.",
                          namespace=SOCK_NAMESPACE)
        return

    if not plate:
        emit_task_failure(task=task,
                          task_id=task_id,
                          task_args={
                              'ladder_id': ladder_id,
                              'plate_id': plate_id
                          },
                          message="Plate No Longer Exists. Reload Page.",
                          namespace=SOCK_NAMESPACE)
        return

    if ladder and plate:
        total_wells = len(plate.wells)
        for idx, w in enumerate(plate.wells):
            w.ladder = ladder
            w.calculate_base_sizes()
            emit_task_progress(task=task,
                               task_id=task_id,
                               task_args={
                                   'ladder_id': ladder_id,
                                   'plate_id': plate_id
                               },
                               progress={
                                   'style': 'determinate',
                                   'total': total_wells,
                                   'current_state': idx + 1,
                                   'message': 'Recalculating Ladders...'
                               },
                               namespace=SOCK_NAMESPACE)
            socketio.sleep()
    emit_task_success(task=task,
                      task_id=task_id,
                      message="Ladder Recalculated Successfully.",
                      task_args={
                          'ladder_id': ladder_id,
                          'plate_id': plate_id
                      },
                      namespace=SOCK_NAMESPACE)


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


@microspat.route('/plate/upload_plate/', methods=['POST', 'OPTIONS'])
def upload_plates():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'Success'})
    print("Uploading Plate")

    @copy_current_request_context
    def bg_upload_plates(plate_files, ladder_id):
        extracted_plates = []
        ladder = Ladder.query.get(ladder_id)
        task = 'upload_plate'
        task_id = generate_task_id()

        emit_task_start(task=task,
                        task_id=task_id,
                        task_args={
                            # 'plate_files': [_.filename for _ in plate_files],
                            'ladder_id': ladder_id
                        },
                        namespace=SOCK_NAMESPACE)
        socketio.sleep()
        for idx, plate_zip_file in enumerate(plate_files):
            print("Uploading Plate File")
            try:
                with open(plate_zip_file, 'rb') as plate_zip:
                    print("Parsing Plate Zip")
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
                        emit_task_progress(task=task,
                                           task_id=task_id,
                                           task_args={
                                                # 'plate_files': [_.filename for _ in plate_files],
                                                'ladder_id': ladder_id
                                           },
                                           progress={
                                               'style': 'determinate',
                                               'total': len(plate_files),
                                               'current_state': idx + 1,
                                               'message': f'Parsing {extracted_plate.label}...',
                                           },
                                           namespace=SOCK_NAMESPACE)
                        socketio.sleep()
                    else:
                        print("Hash Already Exists")
                        print("Emitting Task Progress")
                        emit_task_progress(
                            task=task,
                            task_id=task_id,
                            task_args={
                                # 'plate_files': [_.filename for _ in plate_files],
                                'ladder_id': ladder_id
                            },
                            progress={
                                'style': 'determinate',
                                'total': len(plate_files),
                                'current_state': idx + 1,
                                'message': f"Cannot Process {extracted_plate.label}, Already Exists In Database.",
                            },
                            namespace=SOCK_NAMESPACE
                        )
                        socketio.sleep()
            except Exception as e:
                print(e)
                emit_task_progress(
                    task=task,
                    task_id=task_id,
                    task_args={
                        # 'plate_files': [_.filename for _ in plate_files],
                        'ladder_id': ladder_id
                    },
                    progress={
                        'style': 'determinate',
                        'total': len(plate_files),
                        'current_state': idx + 1,
                        'message': f"Cannot Process {plate_zip.filename}",
                    },
                    namespace=SOCK_NAMESPACE
                )
                socketio.sleep()
            finally:
                os.remove(plate_zip_file)

        submitted_plates = [Plate.from_extracted_plate(plate, ladder) for plate in extracted_plates]
        db.session.commit()

        socketio.sleep()

        emit_task_success(task=task,
                          task_id=task_id,
                          task_args={
                              # 'plate_files': [_.filename for _ in plate_files],
                              'ladder_id': ladder_id
                          },
                          message={'ids': [plate.id for plate in submitted_plates]},
                          namespace=SOCK_NAMESPACE
                          )
        socketio.sleep()

    plate_zips = request.files.getlist('files')
    files = []
    if not os.path.exists('./tmp'):
        os.mkdir('./tmp')
    for i, f in enumerate(plate_zips):
        filename = str(i)
        f.save(os.path.join('./tmp', filename))
        files.append(os.path.join('./tmp', filename))

    ladder_id = request.form.get('ladder_id')
    socketio.start_background_task(bg_upload_plates, files, ladder_id)
    return jsonify({'status': "Success"})


@microspat.route('/plate/upload_plate_map/',  methods=['POST'])
def upload_plate_map():
    @copy_current_request_context
    def bg_upload_plate_map(plate_map_file, plate_id, create_non_existent_samples):
        socketio.sleep()
        task_id = generate_task_id()
        task = 'upload_plate_map'
        emit_task_start(task=task,
                        task_id=task_id,
                        task_args={
                            'plate_id': plate_id
                        },
                        namespace=SOCK_NAMESPACE)
        plate = Plate.query.get(plate_id)
        if not plate:
            emit_task_failure(task=task,
                              task_id=task_id,
                              task_args={
                                  'plate_id': plate_id
                              },
                              message="No Plate Map Uploaded",
                              namespace=SOCK_NAMESPACE)
        else:
            plate_map = csv.DictReader(plate_map_file)
            if 'well' not in [_.lower() for _ in plate_map.fieldnames]:
                emit_task_failure(task=task,
                                  task_id=task_id,
                                  task_args={
                                      'plate_id': plate_id
                                  },
                                  message=f"Plate Map Malformed.",
                                  namespace=SOCK_NAMESPACE)
                return
            locus_labels = [_ for _ in plate_map.fieldnames if _.lower() not in ['', 'well']]
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
                            emit_task_failure(task=task,
                                              task_id=task_id,
                                              task_args={
                                                  'plate_id': plate_id
                                              },
                                              message=f"Sample with barcode '{sample_barcode}' does not exist.",
                                              namespace=SOCK_NAMESPACE)
                            db.session.rollback()
                            return

                        if not locus:
                            emit_task_failure(task=task,
                                              task_id=task_id,
                                              task_args={
                                                  'plate_id': plate_id
                                              },
                                              message=f"Locus with label '{locus_label}' does not exist.",
                                              namespace=SOCK_NAMESPACE)
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
                emit_task_progress(task=task,
                                   task_id=task_id,
                                   task_args={
                                       'plate_id': plate_id
                                   },
                                   progress={
                                       'style': 'determinate',
                                       'total': total_steps,
                                       'current_state': idx + 1,
                                       'message': f'Processing {sample_barcode} at {locus_label}...'
                                   },
                                   namespace=SOCK_NAMESPACE)

            emit_task_success(task=task,
                              task_id=task_id,
                              task_args={
                                  'plate_id': plate_id
                              },
                              message="Plate Map Loaded Successfully",
                              namespace=SOCK_NAMESPACE)

    plate_map_file = request.files.getlist('files')[0]
    plate_map_stream = io.StringIO(plate_map_file.stream.read().decode("utf-8"), newline=None)
    create_non_existent_samples = request.form.get('create_non_existent_samples') == 'true'
    plate_id = int(request.form.get('plate_id'))

    socketio.start_background_task(bg_upload_plate_map, plate_map_stream, plate_id, create_non_existent_samples)
    return jsonify({'status': "Success"})