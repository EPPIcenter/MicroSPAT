import uuid
import eventlet
import flask

from app import socketio
from app.microspat.models import ArtifactEquation, ArtifactEstimator, LocusArtifactEstimator, \
    ArtifactEstimatorLocusParams, ArtifactEstimatorProject, Bin, BinEstimatorLocusParams, BinEstimatorProject, \
    Channel, Ladder, Plate, Well, GenotypingLocusParams, GenotypingProject, Locus, LocusSet, \
    ProjectChannelAnnotations, ProjectSampleAnnotations, QuantificationBiasEstimatorLocusParams, \
    QuantificationBiasEstimatorProject, Control, ControlSampleAssociation, Genotype, Sample, SampleLocusAnnotation, \
    LocusBinSet


class GetException(Exception):
    def __init__(self, *args):
        super(GetException, self).__init__(*args)


class TaskNotifier(object):
    def __init__(self, task, namespace, **kwargs):
        self.task = task
        self.task_id = self.generate_task_id()
        self.namespace = namespace
        self.task_args = kwargs

    @staticmethod
    def generate_task_id():
        return str(uuid.uuid4())

    def emit_task_failure(self, message=None):
        socketio.emit(self.task, {
            'task_args': self.task_args,
            'status': 'failure',
            'id': self.task_id,
            'payload': message
        }, namespace=self.namespace)
        socketio.sleep()

    def emit_task_success(self, message=None):
        socketio.emit(self.task, {
            'task_args': self.task_args,
            'status': 'success',
            'id': self.task_id,
            'payload': message
        }, namespace=self.namespace)
        socketio.sleep()

    def emit_task_start(self, data=None):
        socketio.emit(self.task, {
            'task_args': self.task_args,
            'status': 'start',
            'id': self.task_id,
            'payload': data
        }, namespace=self.namespace)
        socketio.sleep()

    def emit_task_progress(self, progress):
        socketio.emit(self.task, {
            'task_args': self.task_args,
            'status': 'in_progress',
            'id': self.task_id,
            'payload': progress
        }, namespace=self.namespace)
        socketio.sleep()


def respond_404(error):
    res = flask.jsonify({
        'error': error
    })
    res.status_code = 404
    return res


def emit_list(model_namespace, schema_dump):
    socketio.emit('list', {model_namespace: schema_dump.data}, namespace=make_namespace(model_namespace))
    socketio.sleep()


def emit_get(model_namespace, schema_dump):
    socketio.emit('get', {model_namespace: schema_dump.data}, namespace=make_namespace(model_namespace))
    socketio.sleep()


def base_get(model, schema, namespace, subset_size=384):
    def get_fn(json):
        ids = extract_ids(json)
        print(f"Base Get Request Received {namespace}, {len(ids)}")
        for id_subset in subset(ids, subset_size):
            instances = model.query.filter(model.id.in_(id_subset)).all()
            instance_ids = set([_.id for _ in instances])
            not_found = list(set(id_subset) - instance_ids)
            dump = schema.dumps(instances, many=True, separators=(',', ':'))
            res = {
                namespace: dump.data
            }
            not_found_res = {
                namespace: not_found
            }
            socketio.emit('get', res, namespace=flask.request.namespace)
            socketio.emit('get_failed', not_found_res, namespace=flask.request.namespace)
            socketio.sleep()
    return get_fn


def base_list(model, schema, namespace, query=None):
    def list_fn():
        print("Base List Request Received {}".format(namespace))
        if not query:
            instances = model.query.all()
        else:
            instances = query()
        dump = schema.dumps(instances, many=True, separators=(',', ':'))
        res = {
            namespace: dump.data
        }
        socketio.emit('list', res, namespace=flask.request.namespace)
    return list_fn


def extract_ids(json):
    ids = json['id']
    try:
        if isinstance(ids, list):
            ids = list(map(int, ids))
        elif isinstance(ids, (int, str)):
            ids = [int(ids)]
        else:
            raise GetException("Field id not valid", json)
        return ids
    except ValueError:
        raise GetException("Field id not valid", json)


def subset(l, subset_size):
    i = 0
    total_elements = len(l)
    while i < total_elements:
        yield l[i: i + subset_size]
        i += subset_size


def make_namespace(string):
    return "/{}".format(string)


table_to_string_mapping = {
    ArtifactEquation: 'artifact_equation',
    ArtifactEstimator: 'artifact_estimator',
    LocusArtifactEstimator: 'locus_artifact_estimator',
    ArtifactEstimatorLocusParams: 'artifact_estimator_locus_params',
    ArtifactEstimatorProject: 'artifact_estimator_project',
    Bin: 'bin',
    BinEstimatorLocusParams: 'bin_estimator_locus_params',
    BinEstimatorProject: 'bin_estimator_project',
    LocusBinSet: 'locus_bin_set',
    Channel: 'channel',
    Ladder: 'ladder',
    Plate: 'plate',
    Well: 'well',
    GenotypingLocusParams: 'genotyping_locus_params',
    GenotypingProject: 'genotyping_project',
    Locus: 'locus',
    LocusSet: 'locus_set',
    ProjectChannelAnnotations: 'project_channel_annotations',
    ProjectSampleAnnotations: 'project_sample_annotations',
    QuantificationBiasEstimatorLocusParams: 'quantification_bias_estimator_locus_params',
    QuantificationBiasEstimatorProject: 'quantification_bias_estimator_project',
    Control: 'control',
    ControlSampleAssociation: 'control_sample_association',
    Genotype: 'genotype',
    Sample: 'sample',
    SampleLocusAnnotation: 'sample_locus_annotation'
}
