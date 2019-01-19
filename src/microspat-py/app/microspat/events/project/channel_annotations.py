from sqlalchemy.orm import Load

from app.microspat.schemas import ProjectChannelAnnotationsSchema, ChannelListSchema

from app.microspat.models.project.channel_annotations import ProjectChannelAnnotations
from app.microspat.models.ce.channel import Channel

from app.microspat.events.base import (
    extract_ids,
    make_namespace,
    table_to_string_mapping,
)

from app import socketio, db
from app.utils import subset

JSON_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE = table_to_string_mapping[ProjectChannelAnnotations]
CHANNEL_NAMESPACE = table_to_string_mapping[Channel]

project_channel_annotations_schema = ProjectChannelAnnotationsSchema()
channel_schema = ChannelListSchema(exclude="data")


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_project_channel_annotations(json):
    ids = extract_ids(json)

    for id_subset in subset(ids, 2000):
        query = db.session.query(ProjectChannelAnnotations, Channel).join(ProjectChannelAnnotations.channel)
        query = query.options(Load(Channel).defer('data'))
        query = query.filter(ProjectChannelAnnotations.id.in_(id_subset))

        annotations_and_channels = query.all()

        annotations, channels = list(zip(*annotations_and_channels))

        missing_ids = list(set(id_subset) - set([_.id for _ in annotations]))

        if missing_ids:
            socketio.emit('get_failed', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: missing_ids},
                          namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))

        annotations_dump = project_channel_annotations_schema.dumps(annotations, many=True)
        socketio.emit('get', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: annotations_dump.data},
                      namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))

        channels_dump = channel_schema.dumps(channels, many=True)
        socketio.emit('list', {CHANNEL_NAMESPACE: channels_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
        socketio.sleep()


@socketio.on('get_updated', namespace=SOCK_NAMESPACE)
def get_updated_project_channel_annotations(json):
    ids = extract_ids(json)

    for id_subset in subset(ids, 2000):
        query = db.session.query(ProjectChannelAnnotations, Channel).join(ProjectChannelAnnotations.channel)
        query = query.options(Load(Channel).defer('data'))
        query = query.filter(ProjectChannelAnnotations.id.in_(id_subset))

        annotations_and_channels = query.all()

        annotations, channels = list(zip(*annotations_and_channels))

        missing_ids = list(set(id_subset) - set([_.id for _ in annotations]))

        if missing_ids:
            socketio.emit('get_failed', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: missing_ids},
                          namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))

        annotations_dump = project_channel_annotations_schema.dumps(annotations, many=True)
        socketio.emit('get_updated', {PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE: annotations_dump.data},
                      namespace=make_namespace(PROJECT_CHANNEL_ANNOTATIONS_NAMESPACE))

        channels_dump = channel_schema.dumps(channels, many=True)
        socketio.emit('list', {CHANNEL_NAMESPACE: channels_dump.data}, namespace=make_namespace(CHANNEL_NAMESPACE))
        socketio.sleep()
