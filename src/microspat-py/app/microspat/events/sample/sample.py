import tempfile
import os
import sqlite3
import sqlalchemy.exc

from flask import request, jsonify, copy_current_request_context

from app import socketio, db
from app.microspat.schemas import SampleSchema, WellSchema, ChannelSchema
from app.microspat.models import Sample, Well, Channel
from app.microspat.api import microspat_api
from app.utils import CaseInsensitiveDictReader

from ..base import base_list, table_to_string_mapping, make_namespace, TaskNotifier, extract_ids, base_get_updated

JSON_NAMESPACE = table_to_string_mapping[Sample]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

SAMPLE_NAMESPACE = table_to_string_mapping[Sample]
WELL_NAMESPACE = table_to_string_mapping[Well]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]

sample_schema = SampleSchema()
well_schema = WellSchema()
channel_schema = ChannelSchema()

socketio.on_event('list', base_list(Sample, sample_schema, SAMPLE_NAMESPACE, query=Sample.get_serialized_list),
                  namespace=make_namespace(SAMPLE_NAMESPACE))
socketio.on_event('get_updated', base_get_updated(Sample, sample_schema, sample_schema, SAMPLE_NAMESPACE),
                  namespace=make_namespace(SAMPLE_NAMESPACE))


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_sample(json):
    ids = list(set(extract_ids(json)))
    channels = []
    wells = []
    samples = []
    for sample_id in ids:
        sample = Sample.query.get(sample_id)
        if sample:
            samples.append(sample)
            channels += Channel.query.filter(Channel.sample_id == sample_id).all()
            wells += Well.query.join(Channel).filter(Channel.sample_id == sample_id).all()
        else:
            socketio.emit('get_failed', {SAMPLE_NAMESPACE: [sample_id]}, namespace=make_namespace(SAMPLE_NAMESPACE))

    channel_dump = channel_schema.dumps(channels, many=True)
    socketio.emit('get', {CHANNEL_NAMESPACE: channel_dump}, namespace=make_namespace(CHANNEL_NAMESPACE))
    socketio.sleep()

    well_dump = well_schema.dumps(wells, many=True)
    socketio.emit('get', {WELL_NAMESPACE: well_dump}, namespace=make_namespace(WELL_NAMESPACE))
    socketio.sleep()

    sample_dump = sample_schema.dumps(samples, many=True)
    socketio.emit('get', {SAMPLE_NAMESPACE: sample_dump}, namespace=make_namespace(SAMPLE_NAMESPACE))
    socketio.sleep()


@microspat_api.route('/sample/upload_samples/', methods=['POST', 'OPTIONS'])
def upload_samples():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'Success'})

    @copy_current_request_context
    def bg_upload_samples(sample_file):
        task = 'upload_samples'
        task_notifier = TaskNotifier(task=task, namespace=SOCK_NAMESPACE)
        task_notifier.emit_task_start()

        with open(sample_file, 'r') as f:
            try:
                r = CaseInsensitiveDictReader(f)
                entries = list(r)
                id_field = next(_ for _ in ['barcode', 'sample_id', 'id'] if _ in r.fieldnames)
                designation_field = next(_ for _ in ['designation'] if _ in r.fieldnames)
                task_notifier.emit_task_progress(progress={
                    'style': 'determinate',
                    'total': len(entries),
                    'current_state': 1,
                    'message': 'Creating Samples...'
                })
                for idx, entry in enumerate(entries):
                    barcode = entry[id_field].strip()
                    designation = entry.get(designation_field, 'sample').strip()
                    if barcode:
                        sample = Sample(barcode=barcode, designation=designation)
                        db.session.add(sample)
                    task_notifier.emit_task_progress(progress={
                        'style': 'determinate',
                        'total': len(entries),
                        'current_state': idx + 1,
                        'message': 'Creating Samples...'
                    })
            except UnicodeDecodeError:
                task_notifier.emit_task_failure(
                    message="Sample File Malformed. Must be CSV File."
                )
                db.session.rollback()
                return
            except StopIteration:
                task_notifier.emit_task_failure(
                    message="Sample File Malformed. Sample Identifier Must be [('Barcode', 'Sample ID', or 'ID'), "
                            "'Designation']. "
                )
                db.session.rollback()
                return
            except (sqlite3.IntegrityError, sqlalchemy.exc.IntegrityError):
                task_notifier.emit_task_failure(message=f'{id_field} Must Be Unique.')
                db.session.rollback()
                return
            except AssertionError:
                task_notifier.emit_task_failure(
                    message="Sample File Malformed. Designation must be one of ['Negative Control', 'Positive "
                            "Control', 'Sample'] "
                )
            except Exception as e:
                task_notifier.emit_task_failure(
                    message="Something Bad Happened Creating Samples... Restart App"
                )
                return
        task_notifier.emit_task_success()

    sample_file = request.files.getlist('files')[0]
    handle, tmpfile_path = tempfile.mkstemp()
    tmpfile = os.fdopen(handle, mode='wb')
    tmpfile.write(sample_file.stream.read())

    socketio.start_background_task(bg_upload_samples, tmpfile_path)
    return jsonify({'status': 'Success'})
