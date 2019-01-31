from datetime import datetime

from sqlalchemy.orm import make_transient, reconstructor, validates, subqueryload

from app import db, socketio
from app.microspat.models.locus.locus import Locus
from app.microspat.models.locus.locus_set import LocusSet, locus_set_association_table
from app.microspat.models.ce.channel import Channel
from app.microspat.models.ce.well import Well
from app.microspat.models.attributes import LocusSetAssociatedMixin, TimeStamped
from app.microspat.models.project.locus_params import ProjectLocusParams
from app.microspat.models.project.channel_annotations import ProjectChannelAnnotations


class Project(LocusSetAssociatedMixin, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(255), unique=True, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    creator = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    channel_annotations = db.relationship('ProjectChannelAnnotations',
                                          cascade='save-update, merge, delete, expunge',
                                          backref=db.backref('project'), lazy='dynamic')

    discriminator = db.Column('type', db.String(255))

    locked = db.Column(db.Boolean, default=False, nullable=False)
    imported = db.Column(db.Boolean, default=False, nullable=False)

    __mapper_args__ = {'polymorphic_on': discriminator,
                       'polymorphic_identity': 'base_project'}

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def copy_project(cls, project):
        assert isinstance(project, cls)
        locus_params = project.locus_parameters.all()
        channel_annotations = project.channel_annotations.all()

        db.session.expunge(project)
        make_transient(project)

        title_invalid = True
        copy_count = 1
        title = project.title

        while title_invalid:
            title = "Copy {} of {}".format(copy_count, project.title)
            title_invalid = Project.query.filter(Project.title == title).all()
            copy_count += 1

        project.title = title
        project.id = None
        project.date = datetime.utcnow()

        for locus_param in locus_params:
            db.session.expunge(locus_param)
            make_transient(locus_param)
            setattr(locus_param, 'id', None)

        for channel_annotation in channel_annotations:
            db.session.expunge(channel_annotation)
            make_transient(channel_annotation)
            setattr(channel_annotation, 'old_id', channel_annotation.id)
            setattr(channel_annotation, 'id', None)

        db.session.add(project)
        db.session.flush()

        for locus_param in locus_params:
            setattr(locus_param, 'project_id', project.id)
            db.session.add(locus_param)

        for channel_annotation in channel_annotations:
            setattr(channel_annotation, 'project', project)
            db.session.add(channel_annotation)

        db.session.flush()

        return project

    @classmethod
    def delete_project(cls, project, delete_project=False):
        channel_annotations = project.channel_annotations.all()
        for ca in channel_annotations:
            db.session.delete(ca)

    def valid_locus_id(self, locus_id):
        if not self._valid_locus_ids:
            self._valid_locus_ids = set([_[0] for _ in
                                         Locus.query.join(locus_set_association_table).join(LocusSet).filter(
                                             Project.id == self.id).values(Locus.id)])
        return locus_id in self._valid_locus_ids

    @property
    def locus_parameters(self):
        raise NotImplementedError("Project should not be directly initialized.")

    def filter_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Project should not be directly initialized")

    def scanning_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Project should not be directly initialized")

    def set_locus_parameters_stale(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        assert isinstance(lp, ProjectLocusParams)
        lp.set_scanning_parameters_stale()

    @reconstructor
    def init_on_load(self):
        self._locus_param_cache = {}
        self._valid_locus_ids = None

    def __init__(self, locus_set_id, **kwargs):
        super(Project, self).__init__(**kwargs)
        locus_set = LocusSet.query.get(locus_set_id)
        self.locus_set = locus_set
        self._locus_param_cache = {}
        self._valid_locus_ids = set()
        assert isinstance(locus_set, LocusSet)
        for locus in locus_set.loci:
            assert isinstance(locus, Locus)
            locus_param = self.__class__.locus_parameters.mapper.class_()
            locus_param.locus = locus
            self.locus_parameters.append(locus_param)

    def __repr__(self):
        return "<{} {}>".format(self.__class__.__name__, self.title)

    @validates('locus_parameters')
    def validate_locus_params(self, key, locus_param):
        assert locus_param.locus in self.locus_set.loci
        return locus_param

    def add_channel(self, channel_id):
        channel_locus_id = Channel.query.filter(Channel.id == channel_id).value(Channel.locus_id)

        if not channel_locus_id:
            raise ValueError("Channel does not have a locus assigned.")

        valid_locus_id = self.valid_locus_id(channel_locus_id)

        if not valid_locus_id:
            raise ValueError(
                "Channel locus {} is not a member of this project's analysis set.".format(
                    channel_locus_id)
            )

        channel_annotation = self.create_channel_annotation(channel_id)

        locus_parameters = self.get_locus_parameters(channel_locus_id)
        locus_parameters.scanning_parameters_stale = True
        locus_parameters.filter_parameters_stale = True

        return channel_annotation

    def add_channels(self, channel_ids):

        for channel_id in channel_ids:
            socketio.sleep()
            channel_locus_id = Channel.query.filter(Channel.id == channel_id).value(Channel.locus_id)

            if not channel_locus_id:
                raise ValueError("Channel does not have a locus assigned.")

            valid_locus_id = self.valid_locus_id(channel_locus_id)
            if not valid_locus_id:
                raise ValueError(
                    "Channel locus {} is not a member of this project's analysis set.".format(
                        channel_locus_id)
                )
            locus_parameters = self.get_locus_parameters(channel_locus_id)
            locus_parameters.scanning_parameters_stale = True
            locus_parameters.filter_parameters_stale = True

        channel_annotations = self.bulk_create_channel_annotations(channel_ids)

        return channel_annotations

    def create_channel_annotation(self, channel_id):
        channel_annotation = ProjectChannelAnnotations(channel_id=channel_id)
        self.channel_annotations.append(channel_annotation)
        return channel_annotation

    def bulk_create_channel_annotations(self, channel_ids):
        objs = []
        for channel_id in channel_ids:
            pca = ProjectChannelAnnotations(channel_id=channel_id, project_id=self.id)
            db.session.add(pca)
            objs.append(pca)
            # objs.append(ProjectChannelAnnotations(channel_id=channel_id, project_id=self.id))
        # db.session.bulk_save_objects(objs)
        return objs

    def recalculate_channel(self, channel_annotation, rescan_peaks):
        if not isinstance(channel_annotation, ProjectChannelAnnotations):
            channel_annotation = ProjectChannelAnnotations.query.get(channel_annotation)
        channel = channel_annotation.channel

        if channel.well.sizing_quality > channel.well.ladder.unusable_sq_limit:
            channel_annotation.set_flag('poor_sizing_quality', True)
        else:
            channel_annotation.set_flag('poor_sizing_quality', False)

        if channel.well.base_sizes:
            filter_params = self.get_filter_parameters(channel.locus_id)
            if rescan_peaks:
                scanning_params = self.get_scanning_parameters(channel.locus_id)
                channel.identify_peak_indices(scanning_params)
                channel_annotation.peak_indices = channel.peak_indices
            else:
                channel.set_peak_indices(channel_annotation.peak_indices)
            channel.pre_annotate_and_filter(filter_params)

            total_peaks = -1
            while len(channel.peaks) != total_peaks:
                socketio.sleep()
                channel.post_annotate_peaks()
                channel.post_filter_peaks(filter_params)
                total_peaks = len(channel.peaks)

            channel_annotation.annotated_peaks = channel.peaks[:]

        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks):
        recalculated_channel_annotations = []
        for channel_annotation in channel_annotations:
            socketio.sleep()
            recalculated_channel_annotations.append(
                self.recalculate_channel(channel_annotation, rescan_peaks))

        return recalculated_channel_annotations

    def get_filter_parameters(self, locus_id):
        return self.get_locus_parameters(locus_id).filter_parameters

    def get_scanning_parameters(self, locus_id):
        return self.get_locus_parameters(locus_id).scanning_parameters

    def recalculate_locus(self, locus_id):
        locus_parameters = self.get_locus_parameters(locus_id)
        assert isinstance(locus_parameters, ProjectLocusParams)
        locus_parameters.locked = True
        # db.session.flush()
        socketio.sleep()
        channel_annotations = self.get_locus_channel_annotations(locus_id, append_well=True)
        socketio.sleep()
        if locus_parameters.scanning_parameters_stale:
            channel_annotations = self.recalculate_channels(channel_annotations=channel_annotations,
                                                            rescan_peaks=True)
            socketio.sleep()
        else:
            if locus_parameters.filter_parameters_stale:
                channel_annotations = self.recalculate_channels(
                    channel_annotations=channel_annotations,
                    rescan_peaks=False)

        locus_parameters.scanning_parameters_stale = False
        locus_parameters.filter_parameters_stale = False
        locus_parameters.locked = False
        return channel_annotations

    def analyze_locus(self, locus_id):
        self.recalculate_locus(locus_id)
        return self

    def get_locus_channel_annotations(self, locus_id, append_well=False):
        """
        :param locus_id:
        :return: ProjectChannelAnnotations
        """
        q = self.channel_annotations.join(Channel).filter(Channel.locus_id == locus_id)

        if append_well:
            q = q.options(subqueryload(ProjectChannelAnnotations.channel).undefer(Channel.data)
                          .joinedload(Channel.locus), subqueryload(ProjectChannelAnnotations.channel)
                          .joinedload(Channel.well).undefer(Well.base_sizes))
        else:
            q = q.options(subqueryload(ProjectChannelAnnotations.channel).joinedload(Channel.locus))

        return q.all()

    def get_locus_parameters(self, locus_id):
        if not self._locus_param_cache.get(locus_id, None):
            lps = ProjectLocusParams.query.filter(ProjectLocusParams.project_id == self.id)
            self._locus_param_cache = {_.locus_id: _ for _ in lps}
        return self._locus_param_cache.get(locus_id)

    def get_serialized_channels(self, ignore_data=True):
        q = Channel.query.join(ProjectChannelAnnotations).filter(ProjectChannelAnnotations.project_id == self.id)
        return Channel.get_serialized_list(q, ignore_data)

    def serialize(self):
        return {
            'id': self.id,
            'title': self.title,
            'date': str(self.date),
            'creator': self.creator,
            'description': self.description,
            'last_updated': str(self.last_updated),
            'locus_set_id': self.locus_set_id,
            'locus_parameters': {},
        }

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'locus_parameters': {locus_param.locus_id: locus_param.serialize() for locus_param in
                                 self.locus_parameters.all()}
        })
        return res
