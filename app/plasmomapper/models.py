import csv
from collections import defaultdict
from datetime import datetime
from itertools import groupby

from config import Config

# from sklearn.externals import joblib
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.orm import validates, deferred, reconstructor, joinedload
from sqlalchemy import event
from sqlalchemy.orm.util import object_state
from sqlalchemy.orm.session import attributes

from app import db, socketio
from flask import current_app as app

from fsa_extractor.PlateExtractor import PlateExtractor, WellExtractor, ChannelExtractor
from statistics import calculate_allele_frequencies, calculate_peak_probability
import bin_finder.BinFinder as BF
import artifact_estimator.ArtifactEstimator as AE

import eventlet

from ..custom_sql_types.custom_types import JSONEncodedData, MutableDict, MutableList
# from peak_annotator.PeakFilters import base_size_filter, bleedthrough_filter, crosstalk_filter, \
#     peak_height_filter, peak_proximity_filter, relative_peak_height_filter, probability_filter, compose_filters, \
#     bin_filter, flags_filter, artifact_filter, peak_annotations_diff

from peak_annotator.PeakFilters import *


@event.listens_for(db.Model, 'after_update', propagate=True)
def broadcast_update(mapper, connection, target):
    if Config.NOTIFICATIONS:
        socketio.emit('update', {
            'type': target.__class__.__name__,
            'id': target.id
        })


@event.listens_for(db.Model, 'after_delete', propagate=True)
def broadcast_delete(mapper, connection, target):
    if Config.NOTIFICATIONS:
        socketio.emit('delete', {
            'type': target.__class__.__name__,
            'id': target.id
        })


def params_changed(target, params):
    state = object_state(target)

    if not state.modified:
        return False

    dict_ = state.dict

    for attr in state.manager.attributes:
        if not hasattr(attr.impl, 'get_history') or hasattr(attr.impl, 'get_collection') or attr.key not in params:
            continue
        (added, unchanged, deleted) = attr.impl.get_history(state, dict_, passive=attributes.NO_CHANGE)
        if added or deleted:
            return True
    else:
        return False


def format_locus_annotations(all_locus_annotations, peak_filter=None):
    """
    Given a set of locus annotations, converts them to (locus_label, annotated_peaks) tuples, where the annotated peaks
    have had the optional peak_filter applied.

    :param all_locus_annotations: SampleLocusAnnotation[]
    :param peak_filter: function that returns peaks that satisfy condition
    :return:
    """
    if not peak_filter:
        return lambda _: _

    all_locus_annotations.sort(key=lambda _: _.locus.label)
    formatted_locus_annotations = []
    for locus_annotation in all_locus_annotations:
        formatted_locus_annotations.append((locus_annotation.locus.label,
                                            peak_filter(locus_annotation.annotated_peaks)))
    return formatted_locus_annotations


def select_best_run(channel_annotations, offscale_threshold):
    """
    Naive implementation to determine best run. Given more than one run, chooses run with largest peaks that does not
    have poor sizing quality, and if possible, peaks do not exceed offscale_threshold

    :param channel_annotations: ProjectChannelAnnotation[]
    :param offscale_threshold: int
    :return: ProjectChannelAnnotation
    """
    channel_annotations = [x for x in channel_annotations if not x.get_flag('poor_sizing_quality')]

    best_annotation = None

    for annotation in channel_annotations:
        if not annotation.annotated_peaks:
            annotation.annotated_peaks = []
        assert isinstance(annotation, ProjectChannelAnnotations)

        peak_filter = compose_filters(peak_height_filter(max_height=offscale_threshold), bin_filter(in_bin=True))

        if not best_annotation:
            best_annotation = annotation
        else:

            best_peaks = peak_filter(best_annotation.annotated_peaks)
            curr_peaks = peak_filter(annotation.annotated_peaks)

            if best_peaks:
                max_best_peak = max(best_peaks, key=lambda x: x['peak_height'])
            else:
                max_best_peak = {'peak_height': 0}

            if curr_peaks:
                max_curr_peak = max(curr_peaks, key=lambda x: x['peak_height'])
            else:
                max_curr_peak = {'peak_height': 0}

            if max_curr_peak['peak_height'] > max_best_peak['peak_height']:
                best_annotation = annotation

    return best_annotation


class Colored(object):
    color = db.Column(db.String(6), nullable=False)

    @validates('color')
    def validate_color(self, _, color):
        assert color in ['orange', 'red', 'yellow', 'green', 'blue']
        return color


class PeakScanner(object):
    scanning_method = db.Column(db.Text, default='relmax', nullable=False)
    maxima_window = db.Column(db.Integer, default=10, nullable=False)

    # relmax Scanning Params
    argrelmax_window = db.Column(db.Integer, default=6, nullable=False)
    trace_smoothing_window = db.Column(db.Integer, default=11, nullable=False)
    trace_smoothing_order = db.Column(db.Integer, default=7, nullable=False)
    tophat_factor = db.Column(db.Float, default=.005, nullable=False)

    # CWT Scanning Params
    cwt_min_width = db.Column(db.Integer, default=4, nullable=False)
    cwt_max_width = db.Column(db.Integer, default=15, nullable=False)
    min_snr = db.Column(db.Float, default=3, nullable=False)
    noise_perc = db.Column(db.Float, default=13, nullable=False)

    @validates('scanning_method')
    def validate_scanning_method(self, _, scanning_method):
        assert scanning_method in ['cwt', 'relmax']
        return scanning_method

    @property
    def scanning_parameters(self):
        return {
            'scanning_method': self.scanning_method,
            'maxima_window': self.maxima_window,
            'argrelmax_window': self.argrelmax_window,
            'trace_smoothing_window': self.trace_smoothing_window,
            'trace_smoothing_order': self.trace_smoothing_order,
            'tophat_factor': self.tophat_factor,
            'cwt_min_width': self.cwt_min_width,
            'cwt_max_width': self.cwt_max_width,
            'min_snr': self.min_snr,
            'noise_perc': self.noise_perc
        }


class TimeStamped(object):
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Flaggable(object):
    flags = db.Column(MutableDict.as_mutable(JSONEncodedData), default={}, nullable=True)
    comments = db.Column(db.Text)

    def set_flag(self, key, value):
        if self.flags:
            self.flags[key] = value
        else:
            self.flags = {key: value}

    def get_flag(self, key, default=None):
        if self.flags:
            return self.flags.get(key, default)
        else:
            return default

    def get_flag_values(self):
        if self.flags:
            return self.flags.values()
        else:
            return []

    def clear_flags(self):
        self.flags = {}
        return self


class LocusSetAssociatedMixin(object):
    @declared_attr
    def locus_set_id(self):
        return db.Column(db.Integer, db.ForeignKey('locus_set.id'), nullable=False)

    @declared_attr
    def locus_set(self):
        return db.relationship('LocusSet', cascade='save-update, merge')


#
# class SkLearnModel(object):
#     def __init__(self):
#         if not os.path.exists(os.path.join(Config.PLASMOMAPPER_BASEDIR, 'pickled_models', type(self).__name__)):
#             os.mkdir(os.path.join(Config.PLASMOMAPPER_BASEDIR, 'pickled_models', type(self).__name__))
#
#         if self.id and os.path.exists(self.model_location):
#             self.model = joblib.load(self.model_location)
#         else:
#             self.model = None
#
#     @property
#     def model_location(self):
#         return os.path.join(Config.PLASMOMAPPER_BASEDIR, 'pickled_models', type(self).__name__, str(self.id) + ".pkl")
#
#     def save_model(self, model):
#         if self.id:
#             self.model = model
#             joblib.dump(self.model, self.model_location)
#         else:
#             raise AttributeError("{} has not yet been persisted to database.".format(type(self).__name__))


class Sample(TimeStamped, Flaggable, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    barcode = db.Column(db.String(255), nullable=False, unique=True)
    designation = db.Column(db.String(255), nullable=False, default='sample', index=True)
    channels = db.relationship('Channel', backref=db.backref('sample'), lazy='dynamic')

    @validates('designation')
    def validate_designation(self, key, designation):
        assert designation in ['sample', 'positive_control', 'negative_control']
        return designation

    def serialize(self):
        return {
            'id': self.id,
            'barcode': self.barcode,
            'comments': self.comments,
            'designation': self.designation,
            'last_updated': str(self.last_updated)
        }


class Project(LocusSetAssociatedMixin, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), unique=True, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    creator = db.Column(db.String(255))
    description = db.Column(db.Text, nullable=True)
    channel_annotations = db.relationship('ProjectChannelAnnotations', backref=db.backref('project'), lazy='dynamic',
                                          cascade='save-update, merge, delete, delete-orphan')
    discriminator = db.Column('type', db.String(255))
    __mapper_args__ = {'polymorphic_on': discriminator,
                       'polymorphic_identity': 'base_project'}

    @property
    def locus_parameters(self):
        raise NotImplementedError("Project should not be directly initialized.")

    @reconstructor
    def init_on_load(self):
        self._locus_param_cache = {}

    def __init__(self, locus_set_id, **kwargs):
        super(Project, self).__init__(**kwargs)
        locus_set = LocusSet.query.get(locus_set_id)
        self.locus_set = locus_set
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

    def add_channel(self, channel_id, block_commit=False):

        channel_locus_id = Channel.query.filter(Channel.id == channel_id).value(Channel.locus_id)

        if not channel_locus_id:
            raise ValueError("Channel does not have a locus assigned.")

        valid_locus_id = Project.query.join(LocusSet).join(locus_set_association_table).join(Locus).filter(
            Project.id == self.id).filter(Locus.id == channel_locus_id).first()

        if not valid_locus_id:
            raise ValueError(
                "Channel locus {} is not a member of this project's analysis set.".format(
                    channel_locus_id)
            )

        channel_annotation = self.create_channel_annotation(channel_id)

        locus_parameters = self.get_locus_parameters(channel_locus_id)

        locus_parameters.scanning_parameters_stale = True
        locus_parameters.filter_parameters_stale = True
        if not block_commit:
            db.session.commit()

        return channel_annotation

    def add_channels(self, channel_ids, block_commit=False):
        for channel_id in channel_ids:
            eventlet.sleep()
            channel_locus_id = Channel.query.filter(Channel.id == channel_id).value(Channel.locus_id)

            if not channel_locus_id:
                raise ValueError("Channel does not have a locus assigned.")

            valid_locus_id = Project.query.join(LocusSet).join(locus_set_association_table).join(Locus).filter(
                Project.id == self.id).filter(Locus.id == channel_locus_id).first()

            if not valid_locus_id:
                raise ValueError(
                    "Channel locus {} is not a member of this project's analysis set.".format(
                        channel_locus_id)
                )
            locus_parameters = self.get_locus_parameters(channel_locus_id)
            locus_parameters.scanning_parameters_stale = True
            locus_parameters.filter_parameters_stale = True

        channel_annotations = self.bulk_create_channel_annotations(channel_ids, block_commit=True)

        if not block_commit:
            db.session.commit()

        return channel_annotations

    def create_channel_annotation(self, channel_id):
        channel_annotation = ProjectChannelAnnotations(channel_id=channel_id)
        self.channel_annotations.append(channel_annotation)
        return channel_annotation

    def bulk_create_channel_annotations(self, channel_ids, block_commit=False):
        objs = []
        for channel_id in channel_ids:
            objs.append(ProjectChannelAnnotations(channel_id=channel_id, project_id=self.id))
        db.session.bulk_save_objects(objs)
        if not block_commit:
            db.session.commit()
        return objs

    def recalculate_channel(self, channel_annotation, rescan_peaks, block_commit=False):
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
                eventlet.sleep()
                channel.post_annotate_peaks()
                channel.post_filter_peaks(filter_params)
                total_peaks = len(channel.peaks)

            channel_annotation.annotated_peaks = channel.peaks[:]

        if not block_commit:
            db.session.commit()

        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks, block_commit=False):
        recalculated_channel_annotations = []
        for channel_annotation in channel_annotations:
            eventlet.sleep()
            recalculated_channel_annotations.append(
                self.recalculate_channel(channel_annotation, rescan_peaks, block_commit=True))

        if not block_commit:
            db.session.commit()

        return recalculated_channel_annotations

    def get_filter_parameters(self, locus_id):
        return self.get_locus_parameters(locus_id).filter_parameters

    def get_scanning_parameters(self, locus_id):
        return self.get_locus_parameters(locus_id).scanning_parameters

    def recalculate_locus(self, locus_id, block_commit=False):
        locus_parameters = self.get_locus_parameters(locus_id)
        assert isinstance(locus_parameters, ProjectLocusParams)
        app.logger.debug("Recalculating Locus {} for project {}".format(locus_parameters.locus.label, self.title))
        app.logger.debug("Scanning Parameters Stale: {}".format(locus_parameters.scanning_parameters_stale))
        app.logger.debug("Filter Parameters Stale: {}".format(locus_parameters.filter_parameters_stale))
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        if locus_parameters.scanning_parameters_stale:
            channel_annotations = self.recalculate_channels(channel_annotations=channel_annotations,
                                                            rescan_peaks=True, block_commit=True)
        else:
            if locus_parameters.filter_parameters_stale:
                channel_annotations = self.recalculate_channels(
                    channel_annotations=channel_annotations,
                    rescan_peaks=False)

        locus_parameters.scanning_parameters_stale = False
        locus_parameters.filter_parameters_stale = False

        if not block_commit:
            db.session.commit()

        return channel_annotations

    def analyze_locus(self, locus_id, block_commit=False):
        print "Recalculating Locus"
        self.recalculate_locus(locus_id, block_commit=block_commit)
        return self

    def get_locus_channel_annotations(self, locus_id):
        q = self.channel_annotations.join(Channel).filter(Channel.locus_id == locus_id).options(
            joinedload(ProjectChannelAnnotations.channel).joinedload(Channel.locus))
        return q.all()

    def get_locus_parameters(self, locus_id):
        if not self._locus_param_cache.get(locus_id, None):
            self._locus_param_cache[locus_id] = self.locus_parameters.filter(
                ProjectLocusParams.locus_id == locus_id).one()
        return self._locus_param_cache.get(locus_id)

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


class BinEstimating(object):
    @declared_attr
    def bin_estimator_id(self):
        return db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id'), index=True)

    @declared_attr
    def bin_estimator(self):
        return db.relationship('BinEstimatorProject', lazy='select', foreign_keys=[self.bin_estimator_id])

    def bin_estimator_changed(self):
        raise NotImplementedError()

    def clear_bin_annotations(self, channel_annotations):
        for annotation in channel_annotations:
            assert isinstance(annotation, ProjectChannelAnnotations)
            if annotation.annotated_peaks:
                for peak in annotation.annotated_peaks:
                    peak['in_bin'] = False
                    peak['bin'] = ""
                    peak['bin_id'] = None
        return self


class ArtifactEstimating(object):
    @declared_attr
    def artifact_estimator_id(self):
        return db.Column(db.Integer, db.ForeignKey('artifact_estimator_project.id'), index=True)

    @declared_attr
    def artifact_estimator(self):
        return db.relationship('ArtifactEstimatorProject', lazy='select', foreign_keys=[self.artifact_estimator_id])

    def artifact_estimator_changed(self):
        raise NotImplementedError()

    def clear_artifact_annotations(self, channel_annotations):
        for annotation in channel_annotations:
            assert isinstance(annotation, ProjectChannelAnnotations)
            if annotation.annotated_peaks:
                for peak in annotation.annotated_peaks:
                    peak['artifact_contribution'] = 0
                    peak['artifact_error'] = 0
        return self


class SampleBasedProject(Project):
    __mapper_args__ = {'polymorphic_identity': 'sample_based_project'}

    @declared_attr
    def sample_annotations(self):
        return db.relationship('ProjectSampleAnnotations', backref=db.backref('project'), lazy='dynamic',
                               cascade='save-update, merge, delete, delete-orphan')

    @property
    def locus_parameters(self):
        raise NotImplementedError("Sample Based Project should not be directly initialized.")

    def add_sample(self, sample_id, block_commit=False):
        sample_annotation = ProjectSampleAnnotations(sample_id=sample_id)
        self.sample_annotations.append(sample_annotation)

        channel_ids = Channel.query.join(Sample).join(Locus).join(locus_set_association_table).join(LocusSet).join(
            Project).filter(
            Project.id == self.id).filter(Sample.id == sample_id).values(Channel.id)

        self.add_channels([str(x[0]) for x in channel_ids], block_commit=True)

        if not block_commit:
            db.session.commit()

        return sample_annotation

    def add_samples(self, sample_ids):
        full_sample_ids = sample_ids
        n = 0
        while n * 100 < len(full_sample_ids):
            sample_ids = full_sample_ids[n * 100: (n + 1) * 100]
            channel_ids_query = Channel.query.join(Sample).join(Locus).join(locus_set_association_table).join(
                LocusSet).join(Project).filter(Project.id == self.id)
            channel_ids = []
            for sample_id in sample_ids:
                channel_ids += [x[0] for x in channel_ids_query.filter(Sample.id == sample_id).values(Channel.id)]
                sample_annotation = ProjectSampleAnnotations(sample_id=sample_id)
                self.sample_annotations.append(sample_annotation)
                for locus in self.locus_set.loci:
                    locus_sample_annotation = SampleLocusAnnotation(locus_id=locus.id, project_id=self.id)
                    bin_ids = Bin.query.join(LocusBinSet).join(BinEstimatorProject).filter(
                        BinEstimatorProject.id == self.bin_estimator_id).filter(
                        LocusBinSet.locus_id == locus.id).values(Bin.id)
                    locus_sample_annotation.alleles = dict([(str(bin_id[0]), False) for bin_id in bin_ids])
                    sample_annotation.locus_annotations.append(locus_sample_annotation)
            self.bulk_create_channel_annotations(channel_ids, block_commit=True)
            db.session.flush()
            db.session.commit()
            n += 1
        locus_params = self.locus_parameters.all()
        for lp in locus_params:
            lp.filter_parameters_stale = True
            lp.scanning_parameters_stale = True
        db.session.commit()

    def serialize(self):
        res = super(SampleBasedProject, self).serialize()
        res.update({
            'sample_annotations': []
        })
        return res

    def get_locus_sample_annotations(self, locus_id):
        pass

    def serialize_details(self):
        res = super(SampleBasedProject, self).serialize_details()
        sample_annotations = self.sample_annotations.all()
        res.update({
            'sample_annotations': [sample_annotation.serialize() for sample_annotation in sample_annotations]
        })
        return res


class BinEstimatorProject(Project):
    # Collection of channels used to generate bins
    id = db.Column(db.Integer, db.ForeignKey('project.id'), primary_key=True)
    locus_bin_sets = db.relationship('LocusBinSet', lazy='immediate',
                                     cascade='save-update, merge, delete, delete-orphan')

    locus_parameters = db.relationship('BinEstimatorLocusParams', backref=db.backref('bin_estimator_project'),
                                       lazy='dynamic', cascade='save-update, merge, delete, delete-orphan')

    __mapper_args__ = {'polymorphic_identity': 'bin_estimator_project'}

    def calculate_locus_bin_set(self, locus_id):
        self.delete_locus_bin_set(locus_id)
        locus_parameters = self.get_locus_parameters(locus_id)
        annotations = ProjectChannelAnnotations.query.join(Channel).filter(
            ProjectChannelAnnotations.project_id == self.id).filter(Channel.locus_id == locus_id).all()
        peaks = []
        for a in annotations:
            if a.annotated_peaks:
                peaks += a.annotated_peaks
        locus = Locus.query.get(locus_id)
        if locus not in self.locus_set.loci:
            raise ValueError("{} is not a member of this project's analysis set.".format(locus.label))
        if peaks:
            print peaks
            assert isinstance(locus_parameters, BinEstimatorLocusParams)
            locus_bin_set = LocusBinSet.from_peaks(locus_id=locus_id, peaks=peaks,
                                                   min_peak_frequency=locus_parameters.min_peak_frequency,
                                                   bin_buffer=locus_parameters.default_bin_buffer)
            self.locus_bin_sets.append(locus_bin_set)
        return self

    def calculate_locus_bin_sets(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.calculate_locus_bin_set(locus.id)
        return self

    def delete_locus_bin_set(self, locus_id):
        old_sets = [x for x in self.locus_bin_sets if x.locus_id == locus_id]
        for s in old_sets:
            db.session.delete(s)

    def annotate_bins(self, peaks, locus_id):
        lbs = self.get_locus_bin_set(locus_id)
        assert isinstance(lbs, LocusBinSet)
        if peaks:
            peaks = lbs.annotate_bins(peaks)
        return peaks

    def get_locus_bin_set(self, locus_id):
        lbs = next(locus_bin_set for locus_bin_set in self.locus_bin_sets if locus_bin_set.locus_id == locus_id)
        return lbs

    def analyze_locus(self, locus_id, block_commit=False):
        super(BinEstimatorProject, self).analyze_locus(locus_id, block_commit)
        locus_params = self.get_locus_parameters(locus_id)
        if locus_params.bin_estimator_parameters_stale:
            self.calculate_locus_bin_set(locus_id)
            projects = GenotypingProject.query.filter(GenotypingProject.bin_estimator_id == self.id).all()
            for project in projects:
                assert isinstance(project, GenotypingProject)
                project.bin_estimator_changed(locus_id)
            locus_params.bin_estimator_parameters_stale = False
        return self

    def initialize_project(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.delete_locus_bin_set(locus.id)
        self.channel_annotations.delete()
        for lp in self.locus_parameters.all():
            assert isinstance(lp, ProjectLocusParams)
            lp.scanning_parameters_stale = True
            lp.filter_parameters_stale = True
            channel_ids = set(Channel.query.filter(Channel.locus_id == lp.locus_id).values(Channel.id))
            self.bulk_create_channel_annotations(channel_ids)
        return self

    def serialize(self):
        res = super(BinEstimatorProject, self).serialize()
        res.update({
            'locus_bin_sets': {}
        })
        return res

    def serialize_details(self):
        res = super(BinEstimatorProject, self).serialize_details()
        res.update({
            'locus_bin_sets': {locus_bin_set.locus_id: locus_bin_set.serialize() for locus_bin_set in
                               self.locus_bin_sets}
        })
        return res

    def get_alleles_dict(self, locus_id):
        lbs = self.get_locus_bin_set(locus_id)
        return {x.id: False for x in lbs.bins}


class LocusBinSet(BF.BinFinder, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"))
    locus = db.relationship('Locus', lazy='immediate')
    project_id = db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id', ondelete="CASCADE"))
    project = db.relationship('BinEstimatorProject')

    bins = db.relationship('Bin', lazy='immediate', cascade='save-update, merge, delete, delete-orphan')

    @classmethod
    def from_peaks(cls, locus_id, peaks, min_peak_frequency, bin_buffer):
        locus = Locus.query.get(locus_id)
        locus_bin_set = cls()
        locus_bin_set.locus = locus
        db.session.add(locus_bin_set)

        bin_set = BF.BinFinder()
        bin_set.calculate_bins(peaks=peaks, nucleotide_repeat_length=locus.nucleotide_repeat_length,
                               min_peak_frequency=min_peak_frequency, bin_buffer=bin_buffer)
        for b in bin_set.bins:
            assert isinstance(b, BF.Bin)
            b = Bin(label=b.label, base_size=b.base_size, bin_buffer=b.bin_buffer, peak_count=b.peak_count)
            locus_bin_set.bins.append(b)
        return locus_bin_set

    @reconstructor
    def init_on_load(self):
        super(LocusBinSet, self).__init__(self.bins)

    def serialize(self):
        res = {
            'id': self.id,
            'locus_id': self.locus_id,
            'project_id': self.project_id,
            'bins': {bin.id: bin.serialize() for bin in self.bins}
        }
        return res


class Bin(Flaggable, BF.Bin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_bin_set_id = db.Column(db.Integer, db.ForeignKey('locus_bin_set.id', ondelete="CASCADE"))
    label = db.Column(db.Text, nullable=False)
    base_size = db.Column(db.Float, nullable=False)
    bin_buffer = db.Column(db.Float, nullable=False)
    peak_count = db.Column(db.Integer)

    def __repr__(self):
        return "<Bin {}>".format(self.label)

    @reconstructor
    def init_on_load(self):
        super(Bin, self).__init__(self.label, self.base_size, self.bin_buffer, self.peak_count)

    def serialize(self):
        res = {
            'locus_bin_set_id': self.locus_bin_set_id,
            'label': self.label,
            'base_size': self.base_size,
            'bin_buffer': self.bin_buffer,
            'peak_count': self.peak_count
        }
        return res


class ArtifactEstimatorProject(Project):
    id = db.Column(db.Integer, db.ForeignKey('project.id'), primary_key=True)
    bin_estimator_id = db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id'), nullable=False)
    bin_estimator = db.relationship('BinEstimatorProject', foreign_keys=[bin_estimator_id])
    locus_artifact_estimators = db.relationship('LocusArtifactEstimator', lazy='immediate',
                                                cascade='save-update, merge, delete, delete-orphan')

    locus_parameters = db.relationship('ArtifactEstimatorLocusParams', lazy='dynamic',
                                       backref=db.backref('artifact_estimator_project'),
                                       cascade='save-update, merge, delete, delete-orphan')

    __mapper_args__ = {'polymorphic_identity': 'artifact_estimator_project'}

    def add_channel(self, channel_id, block_commit=False):
        channel_annotation = super(ArtifactEstimatorProject, self).add_channel(channel_id, block_commit)
        assert isinstance(self.bin_estimator, BinEstimatorProject)
        self.bin_estimator.annotate_bins(channel_annotation.annotated_peaks, channel_annotation.channel.locus_id)
        return channel_annotation

    def add_channels(self, channel_ids, block_commit=False):
        channel_annotations = []

        for channel_id in channel_ids:
            channel_annotation = self.add_channel(channel_id, block_commit=True)
            channel_annotations.append(channel_annotation)

        if not block_commit:
            db.session.commit()

        return channel_annotations

    def annotate_channel(self, channel_annotation):
        if channel_annotation.annotated_peaks:
            if self.bin_estimator:
                channel_annotation.annotated_peaks = self.bin_estimator.annotate_bins(
                    channel_annotation.annotated_peaks,
                    channel_annotation.channel.locus_id)

    def recalculate_channel(self, channel_annotation, rescan_peaks, block_commit=False):
        channel_annotation = super(ArtifactEstimatorProject, self).recalculate_channel(channel_annotation,
                                                                                       rescan_peaks,
                                                                                       block_commit=True)
        self.annotate_channel(channel_annotation)

        if not block_commit:
            db.session.commit()

        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks, block_commit=False):
        recalculated_channel_annotations = super(ArtifactEstimatorProject, self).recalculate_channels(
            channel_annotations, rescan_peaks, block_commit=True)

        for channel_annotation in recalculated_channel_annotations:
            self.annotate_channel(channel_annotation)

        if not block_commit:
            db.session.commit()

        return recalculated_channel_annotations

    def delete_locus_artifact_estimator(self, locus_id):
        old_estimators = [x for x in self.locus_artifact_estimators if x.locus_id == locus_id]
        print old_estimators
        for e in old_estimators:
            db.session.delete(e)
        db.session.commit()
        return ArtifactEstimatorProject.query.get(self.id)

    def calculate_locus_artifact_estimator(self, locus_id):
        self.delete_locus_artifact_estimator(locus_id)
        annotations = []
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        locus_parameters = self.get_locus_parameters(locus_id)
        assert isinstance(locus_parameters, ArtifactEstimatorLocusParams)
        max_relative_peak_height = locus_parameters.max_secondary_relative_peak_height
        print max_relative_peak_height
        for channel_annotation in channel_annotations:
            peaks = channel_annotation.annotated_peaks
            if peaks:
                main_peaks = []
                secondary_peaks = []
                for peak in peaks:
                    if peak['relative_peak_height'] < max_relative_peak_height:
                        secondary_peaks.append(peak)
                    else:
                        main_peaks.append(peak)
                if len(main_peaks) == 1 and main_peaks[0]['relative_peak_height'] == 1:
                    if secondary_peaks:
                        annotations.append(peaks)
        locus_artifact_estimator = None
        print self.locus_artifact_estimators

        if annotations:
            print "Estimating Artifact"
            locus_artifact_estimator = LocusArtifactEstimator.from_peaks(locus_id, annotations,
                                                                         locus_parameters.min_artifact_peak_frequency)
            db.session.add(locus_artifact_estimator)
            self.locus_artifact_estimators.append(locus_artifact_estimator)

        return locus_artifact_estimator

    def calculate_locus_artifact_estimators(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.calculate_locus_artifact_estimator(locus.id)
        return self

    def annotate_artifact(self, annotated_peaks, locus_id):
        if annotated_peaks:
            for peak in annotated_peaks:
                peak['artifact_contribution'] = 0
                peak['artifact_error'] = 0
            artifact_annotator = next(
                locus_artifact_estimator for locus_artifact_estimator in self.locus_artifact_estimators if
                locus_artifact_estimator.locus_id == locus_id)
            assert isinstance(artifact_annotator, LocusArtifactEstimator)
            annotated_peaks = artifact_annotator.annotate_artifact(annotated_peaks)
        return annotated_peaks

    def analyze_locus(self, locus_id, block_commit=False):
        super(ArtifactEstimatorProject, self).analyze_locus(locus_id, block_commit)
        locus_parameters = self.get_locus_parameters(locus_id)
        if locus_parameters.artifact_estimator_parameters_stale:
            self.calculate_locus_artifact_estimator(locus_id)
            projects = GenotypingProject.query.filter(GenotypingProject.artifact_estimator_id == self.id).all()
            for project in projects:
                assert isinstance(project, GenotypingProject)
                project.artifact_estimator_changed(locus_id)
            locus_parameters.artifact_estimator_parameters_stale = False
        return self

    def initialize_project(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.delete_locus_artifact_estimator(locus.id)
        self.channel_annotations.delete()
        for lp in self.locus_parameters.all():
            assert isinstance(lp, ArtifactEstimatorLocusParams)
            lp.scanning_parameters_stale = True
            lp.filter_parameters_stale = True
            channel_ids = set(Channel.query.filter(Channel.locus_id == lp.locus_id).values(Channel.id))
            self.bulk_create_channel_annotations(channel_ids)
        return self

    def serialize(self):
        res = super(ArtifactEstimatorProject, self).serialize()
        res.update({
            'bin_estimator_id': self.bin_estimator_id,
            'locus_artifact_estimators': {}
        })
        return res

    def serialize_details(self):
        res = super(ArtifactEstimatorProject, self).serialize_details()
        res.update({
            'bin_estimator_id': self.bin_estimator_id,
            'locus_artifact_estimators': {locus_artifact_estimator.locus_id: locus_artifact_estimator.serialize() for
                                          locus_artifact_estimator in self.locus_artifact_estimators}
        })
        return res


class LocusArtifactEstimator(AE.ArtifactEstimatorSet, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"))
    locus = db.relationship('Locus')
    project_id = db.Column(db.Integer, db.ForeignKey('artifact_estimator_project.id', ondelete="CASCADE"))
    project = db.relationship('ArtifactEstimatorProject')
    artifact_estimators = db.relationship('ArtifactEstimator', lazy='immediate',
                                          cascade='save-update, merge, delete, delete-orphan')

    def __repr__(self):
        return "<Artifact Estimator {}>".format(self.locus.label)

    @classmethod
    def from_peaks(cls, locus_id, peak_sets, min_artifact_peak_frequency):
        locus = Locus.query.get(locus_id)
        locus_artifact_estimator = cls()
        locus_artifact_estimator.locus = locus

        db.session.add(locus_artifact_estimator)

        ae = AE.ArtifactEstimatorSet.from_peaks(peak_sets=peak_sets, start_size=locus.min_base_length,
                                                end_size=locus.max_base_length,
                                                min_artifact_peak_frequency=min_artifact_peak_frequency,
                                                nucleotide_repeat_length=locus.nucleotide_repeat_length)

        for estimator in ae.artifact_estimators:
            eventlet.sleep()
            assert isinstance(estimator, AE.ArtifactEstimator)
            artifact_estimator = ArtifactEstimator(artifact_distance=estimator.artifact_distance,
                                                   artifact_distance_buffer=estimator.artifact_distance_buffer,
                                                   peak_data=estimator.peak_data)
            for eqn in estimator.artifact_equations:
                eventlet.sleep()
                assert isinstance(eqn, AE.ArtifactEquation)
                artifact_equation = ArtifactEquation(sd=eqn.sd, r_squared=eqn.r_squared, slope=eqn.slope,
                                                     intercept=eqn.intercept, start_size=eqn.start_size,
                                                     end_size=eqn.end_size)
                artifact_estimator.artifact_equations.append(artifact_equation)
            locus_artifact_estimator.artifact_estimators.append(artifact_estimator)

        return locus_artifact_estimator

    @reconstructor
    def init_on_load(self):
        super(LocusArtifactEstimator, self).__init__(self.artifact_estimators)

    def serialize(self):
        res = {
            'id': self.id,
            'locus_id': self.locus_id,
            'project_id': self.project_id,
            'artifact_estimators': [artifact_estimator.serialize() for artifact_estimator in self.artifact_estimators]
        }
        return res


class ArtifactEstimator(AE.ArtifactEstimator, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    artifact_distance = db.Column(db.Float, nullable=False)
    artifact_distance_buffer = db.Column(db.Float, nullable=False)
    locus_artifact_estimator_id = db.Column(db.Integer,
                                            db.ForeignKey('locus_artifact_estimator.id', ondelete="CASCADE"))
    locus_artifact_estimator = db.relationship('LocusArtifactEstimator')
    artifact_equations = db.relationship('ArtifactEquation', lazy='immediate',
                                         cascade='save-update, merge, delete, delete-orphan')
    peak_data = db.Column(MutableList.as_mutable(JSONEncodedData))

    @reconstructor
    def init_on_load(self):
        super(ArtifactEstimator, self).__init__(self.artifact_distance, self.artifact_distance_buffer, self.peak_data,
                                                self.artifact_equations)

    def generate_estimating_equations(self, parameter_sets):
        for eq in self.artifact_equations:
            db.session.delete(eq)
        self.artifact_equations = []
        artifact_equations = super(ArtifactEstimator, self).generate_estimating_equations(parameter_sets)
        for ae in artifact_equations:
            self.artifact_equations.append(
                ArtifactEquation(sd=ae.sd, r_squared=ae.r_squared, slope=ae.slope, intercept=ae.intercept,
                                 start_size=ae.start_size, end_size=ae.end_size))
        return self

    def add_breakpoint(self, breakpoint):
        """
        :type breakpoint: float
        """
        old_param_sets = [{
                              'start_size': eq.start_size,
                              'end_size': eq.end_size,
                              'method': 'TSR'
                          } for eq in self.artifact_equations]

        param_sets = []
        for param_set in old_param_sets:
            if param_set['start_size'] < breakpoint < param_set['end_size']:
                param_sets.append({
                    'start_size': param_set['start_size'],
                    'end_size': breakpoint,
                    'method': 'TSR'
                })
                param_sets.append({
                    'start_size': breakpoint,
                    'end_size': param_set['end_size'],
                    'method': 'TSR'
                })
            else:
                param_sets.append(param_set)
        self.generate_estimating_equations(param_sets)
        return self

    def clear_breakpoints(self):
        param_sets = [{
            'start_size': self.locus_artifact_estimator.locus.min_base_length,
            'end_size': self.locus_artifact_estimator.locus.max_base_length,
            'method': 'TSR'
        }]
        self.generate_estimating_equations(param_sets)
        return self

    def serialize(self):
        res = {
            'id': self.id,
            'artifact_distance': self.artifact_distance,
            'artifact_distance_buffer': self.artifact_distance_buffer,
            'locus_artifact_estimator_id': self.locus_artifact_estimator_id,
            'peak_data': self.peak_data,
            'artifact_equations': [eqn.serialize() for eqn in self.artifact_equations]
        }
        return res


class ArtifactEquation(Flaggable, AE.ArtifactEquation, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    artifact_estimator_id = db.Column(db.Integer, db.ForeignKey('artifact_estimator.id', ondelete="CASCADE"))
    sd = db.Column(db.Float, nullable=False)
    r_squared = db.Column(db.Float, nullable=True)
    slope = db.Column(db.Float, nullable=False)
    intercept = db.Column(db.Float, nullable=False)
    start_size = db.Column(db.Float, nullable=False)
    end_size = db.Column(db.Float, nullable=False)

    def __repr__(self):
        return "<Artifact Equation y = {}x + {}".format(self.slope, self.intercept)

    @reconstructor
    def init_on_load(self):
        super(ArtifactEquation, self).__init__(self.sd, self.r_squared, self.slope, self.intercept, self.start_size,
                                               self.end_size)

    def serialize(self):
        res = {
            'id': self.id,
            'artifact_estimator_id': self.artifact_estimator_id,
            'sd': self.sd,
            'r_squared': self.r_squared,
            'slope': self.slope,
            'intercept': self.intercept,
            'start_size': self.start_size,
            'end_size': self.end_size
        }
        return res


class GenotypingProject(SampleBasedProject, BinEstimating, ArtifactEstimating):
    # Collection of methods to annotate peaks with artifact, bin in which a peak falls, probabilistic estimate of peak
    id = db.Column(db.Integer, db.ForeignKey('project.id'), primary_key=True)
    locus_parameters = db.relationship('GenotypingLocusParams', backref=db.backref('genotyping_project'),
                                       lazy='dynamic',
                                       cascade='save-update, merge, delete, delete-orphan')

    probability_threshold = db.Column(db.Float, default=.5, nullable=False)

    __mapper_args__ = {'polymorphic_identity': 'genotyping_project'}

    def __init__(self, locus_set_id, bin_estimator_id, artifact_estimator_id, **kwargs):
        super(GenotypingProject, self).__init__(locus_set_id, **kwargs)
        self.bin_estimator_id = bin_estimator_id
        self.artifact_estimator_id = artifact_estimator_id

    def clear_sample_annotations(self, locus_id):
        sample_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).filter(
            SampleLocusAnnotation.locus_id == locus_id).filter(ProjectSampleAnnotations.project_id == self.id).all()
        for sample_annotation in sample_locus_annotations:
            assert isinstance(sample_annotation, SampleLocusAnnotation)
            sample_annotation.annotated_peaks = []
            sample_annotation.reference_run_id = None
            sample_annotation.clear_flags()

    def clear_bin_annotations(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        super(GenotypingProject, self).clear_bin_annotations(channel_annotations)
        self.clear_sample_annotations(locus_id)
        return self

    def clear_artifact_annotations(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        super(GenotypingProject, self).clear_artifact_annotations(channel_annotations)
        self.clear_sample_annotations(locus_id)
        return self

    def bin_estimator_changed(self, locus_id):
        self.clear_bin_annotations(locus_id)
        self.initialize_alleles(locus_id)
        lp = self.get_locus_parameters(locus_id)
        lp.filter_parameters_stale = True
        return self

    def artifact_estimator_changed(self, locus_id):
        self.clear_artifact_annotations(locus_id)
        self.initialize_alleles(locus_id)
        lp = self.get_locus_parameters(locus_id)
        lp.filter_parameters_stale = True
        return self

    def annotate_channel(self, channel_annotation):
        assert isinstance(channel_annotation, ProjectChannelAnnotations)
        if channel_annotation.annotated_peaks:

            if self.bin_estimator:
                for peak in channel_annotation.annotated_peaks:
                    peak['in_bin'] = False
                    peak['bin'] = ""
                    peak['bin_id'] = None
                channel_annotation.annotated_peaks = self.bin_estimator.annotate_bins(
                    channel_annotation.annotated_peaks,
                    channel_annotation.channel.locus_id)

            if self.artifact_estimator:
                for peak in channel_annotation.annotated_peaks:
                    peak['artifact_contribution'] = 0
                    peak['artifact_error'] = 0
                channel_annotation.annotated_peaks = self.artifact_estimator.annotate_artifact(
                    channel_annotation.annotated_peaks, channel_annotation.channel.locus_id)

            channel_annotation.annotated_peaks.changed()

    def recalculate_channel(self, channel_annotation, rescan_peaks, block_commit=False):
        eventlet.sleep()
        channel_annotation = super(GenotypingProject, self).recalculate_channel(channel_annotation, rescan_peaks,
                                                                                block_commit=True)

        self.annotate_channel(channel_annotation)

        if not block_commit:
            db.session.commit()
        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks, block_commit=False):
        channel_annotations = super(GenotypingProject, self).recalculate_channels(channel_annotations, rescan_peaks,
                                                                                  block_commit=True)

        for channel_annotation in channel_annotations:
            self.annotate_channel(channel_annotation)

        if not block_commit:
            db.session.commit()
        return channel_annotations

    def add_channel(self, channel_id, block_commit=False):
        channel_annotation = ProjectChannelAnnotations.query.filter(
            ProjectChannelAnnotations.channel_id == channel_id).filter(
            ProjectChannelAnnotations.project_id == self.id).first()

        if not channel_annotation:
            print "Adding new channel"
            channel_annotation = super(GenotypingProject, self).add_channel(channel_id, block_commit=True)

            if not block_commit:
                db.session.commit()

        return channel_annotation

    def add_channels(self, channel_ids, block_commit=False):
        channel_annotations = super(GenotypingProject, self).add_channels(channel_ids, block_commit=True)

        if not block_commit:
            db.session.commit()

        return channel_annotations

    def add_sample(self, sample_id, block_commit=False):
        sample_annotation = super(GenotypingProject, self).add_sample(sample_id, block_commit=block_commit)
        for locus in self.locus_set.loci:
            locus_sample_annotation = SampleLocusAnnotation(locus_id=locus.id, project_id=self.id)
            bin_ids = Bin.query.join(LocusBinSet).join(BinEstimatorProject).filter(
                BinEstimatorProject.id == self.bin_estimator_id).filter(LocusBinSet.locus_id == locus.id).values(Bin.id)
            locus_sample_annotation.alleles = dict([(str(bin_id[0]), False) for bin_id in bin_ids])
            sample_annotation.locus_annotations.append(locus_sample_annotation)

    def analyze_locus(self, locus_id, block_commit=False):
        locus_params = self.get_locus_parameters(locus_id)
        if locus_params.scanning_parameters_stale or locus_params.filter_parameters_stale:
            locus_params.genotyping_parameters_stale = True

        super(GenotypingProject, self).analyze_locus(locus_id, block_commit)

        if locus_params.genotyping_parameters_stale:
            self.analyze_samples(locus_id)
            locus_params.genotyping_parameters_stale = False
        return self

    def get_sample_locus_annotations(self, locus_id):
        q = SampleLocusAnnotation.query.filter(
            SampleLocusAnnotation.project_id == self.id).filter(SampleLocusAnnotation.locus_id == locus_id).options(
            joinedload(SampleLocusAnnotation.sample_annotation)
        )
        return q.all()

    def analyze_samples(self, locus_id):
        locus_params = self.get_locus_parameters(locus_id)
        assert isinstance(locus_params, GenotypingLocusParams)
        locus_annotations = self.get_sample_locus_annotations(locus_id)
        all_runs = self.get_runs(locus_id)
        for locus_annotation in locus_annotations:
            eventlet.sleep()

            try:
                locus_annotation.alleles.pop('None')
            except KeyError:
                pass

            assert isinstance(locus_annotation, SampleLocusAnnotation)
            channel_annotation = select_best_run(all_runs[locus_annotation.sample_annotation.sample_id],
                                                 locus_params.offscale_threshold)
            if channel_annotation:
                locus_annotation.reference_run = channel_annotation
                peaks = channel_annotation.annotated_peaks[:]

                peaks = [self.flag_peak(x, locus_params) for x in peaks]

                locus_annotation.annotated_peaks = peaks

                if any([x['peak_height'] > locus_params.failure_threshold for x in locus_annotation.annotated_peaks]):
                    locus_annotation.set_flag('failure', False)
                else:
                    locus_annotation.set_flag('failure', True)

                if any([(x['peak_height'] > locus_params.offscale_threshold) or
                                                x['peak_height'] * x[
                                            'bleedthrough_ratio'] > locus_params.offscale_threshold or
                                                x['peak_height'] * x[
                                            'crosstalk_ratio'] > locus_params.offscale_threshold
                        for x in locus_annotation.annotated_peaks]):
                    locus_annotation.set_flag('offscale', True)
                else:
                    locus_annotation.set_flag('offscale', False)

                locus_annotation.set_flag('manual_curation', False)

                locus_annotation.alleles = dict.fromkeys(self.bin_estimator.get_alleles_dict(locus_id), False)

                if not locus_annotation.get_flag('failure'):
                    for peak in locus_annotation.annotated_peaks:
                        if not any(peak['flags'].values()) and peak['bin_id']:
                            locus_annotation.alleles[peak['bin_id']] = True
                    print locus_annotation.alleles
            else:
                locus_annotation.reference_run = None
                locus_annotation.annotated_peaks = []
        return self

    @staticmethod
    def flag_peak(peak, locus_params):
        """
        :type peak: dict
        :type locus_params: GenotypingLocusParams
        """
        peak['flags'] = {
            'below_relative_threshold': False,
            'bleedthrough': False,
            'crosstalk': False,
            'artifact': False,
        }
        if peak['relative_peak_height'] < locus_params.relative_peak_height_limit:
            peak['flags']['below_relative_threshold'] = True
        adjusted_peak_height = peak['peak_height'] - peak['artifact_contribution'] - (
            peak['artifact_error'] * locus_params.hard_artifact_sd_limit)
        if adjusted_peak_height < locus_params.absolute_peak_height_limit:
            peak['flags']['artifact'] = True
        if peak['bleedthrough_ratio'] > locus_params.bleedthrough_filter_limit or peak['peak_height'] * \
                peak['bleedthrough_ratio'] > locus_params.offscale_threshold:
            peak['flags']['bleedthrough'] = True
        if peak['crosstalk_ratio'] > locus_params.crosstalk_filter_limit or peak['peak_height'] * \
                peak['crosstalk_ratio'] > locus_params.offscale_threshold:
            peak['flags']['crosstalk'] = True
        return peak

    @property
    def probability_filter(self):
        return probability_filter(self.probability_threshold)

    def probabilistic_peak_annotation(self):
        # generate allele frequencies
        # for each sample, find MOI using "real peaks" only => real peaks are greater than hard artifact threshold

        peak_filter = compose_filters(bin_filter(in_bin=True), flags_filter(), self.probability_filter)

        all_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).join(Sample).filter(
            Sample.designation == 'sample').filter(SampleLocusAnnotation.project_id == self.id).all()

        all_locus_annotations = [_ for _ in all_locus_annotations if not _.get_flag('failure')]

        locus_annotation_dict = defaultdict(list)
        for annotation in all_locus_annotations:
            locus_annotation_dict[annotation.sample_annotations_id].append(annotation)

        self.initialize_probability_annotations(all_locus_annotations)

        db.session.flush()

        sample_annotations = self.sample_annotations.join(Sample).filter(Sample.designation == 'sample').all()

        alleles_changed = True
        cycles = 0
        while alleles_changed:
            eventlet.sleep()

            cycles += 1
            alleles_changed = False

            allele_frequency_locus_annotations = format_locus_annotations(all_locus_annotations, peak_filter)
            allele_frequencies = calculate_allele_frequencies(allele_frequency_locus_annotations)

            for sample_annotation in sample_annotations:

                assert isinstance(sample_annotation, ProjectSampleAnnotations)
                # sample_annotation.moi = 0
                locus_annotations = locus_annotation_dict[sample_annotation.id]
                moi = self.calculate_moi(locus_annotations)
                sample_annotation.moi = moi

                for locus_annotation in locus_annotations:

                    if locus_annotation.annotated_peaks and not locus_annotation.get_flag('failure'):
                        locus_params = self.get_locus_parameters(locus_annotation.locus_id)
                        artifact_peak_filter = artifact_filter(locus_params.absolute_peak_height_limit,
                                                               locus_params.soft_artifact_sd_limit)

                        peaks_copy = locus_annotation.annotated_peaks[:]
                        all_peaks = self.probability_filter(peaks_copy)
                        possible_artifact_peaks = peak_annotations_diff(all_peaks, artifact_peak_filter(all_peaks))

                        locus_allele_frequencies = allele_frequencies[locus_annotation.locus.label]

                        true_peak_count = len([peak for peak in peaks_copy if
                                               peak['probability'] > self.probability_threshold])

                        recalculated_probabilities = calculate_peak_probability(possible_artifact_peaks,
                                                                                sample_annotation.moi - true_peak_count,
                                                                                locus_allele_frequencies)

                        for peak in possible_artifact_peaks:
                            if recalculated_probabilities[peak['peak_index']] < self.probability_threshold:
                                alleles_changed = True
                            peak['probability'] = recalculated_probabilities[peak['peak_index']]
                        locus_annotation.annotated_peaks = peaks_copy

        for locus_annotation in all_locus_annotations:
            locus_annotation.annotated_peaks.changed()

        for sample_annotation in sample_annotations:
            for locus_annotation in locus_annotation_dict[sample_annotation.id]:
                locus_annotation.alleles = dict.fromkeys(locus_annotation.alleles, False)
                locus_annotation.alleles.changed()
                if locus_annotation.annotated_peaks and not locus_annotation.get_flag('failure'):
                    for peak in locus_annotation.annotated_peaks:
                        if peak['probability'] >= self.probability_threshold:
                            locus_annotation.alleles[str(peak['bin_id'])] = True
                            locus_annotation.alleles.changed()

        db.session.flush()
        app.logger.debug("Cycles Completed: {}".format(cycles))
        return self

    def calculate_moi(self, locus_annotations):
        peak_counts = []
        for locus_annotation in locus_annotations:
            if locus_annotation.annotated_peaks and not locus_annotation.get_flag('failure'):
                peak_counts.append(len([x for x in locus_annotation.annotated_peaks if
                                        x['probability'] >= self.probability_threshold]))
            else:
                peak_counts.append(0)
        peak_counts.sort()
        # if len(peak_counts) > 2:
        #     moi = peak_counts[-2]
        # else:
        #     moi = 0
        if len(peak_counts) > 0:
            moi = peak_counts[-1]
        else:
            moi = 0
        return moi

    @staticmethod
    def initialize_probability_annotations(locus_annotations):
        print "Initializing Probabilities"
        for locus_annotation in locus_annotations:
            if locus_annotation.annotated_peaks:
                for peak in locus_annotation.annotated_peaks:
                    if peak.get('in_bin') and not any(peak['flags'].values()):
                        peak['probability'] = 1
                    else:
                        peak['probability'] = 0
                locus_annotation.annotated_peaks.changed()

    def serialize(self):
        res = super(GenotypingProject, self).serialize()
        res.update({
            'bin_estimator_id': self.bin_estimator_id,
            'artifact_estimator_id': self.artifact_estimator_id,
            'probability_threshold': self.probability_threshold
        })
        return res

    def serialize_details(self):
        res = super(GenotypingProject, self).serialize_details()
        res.update({
            'bin_estimator_id': self.bin_estimator_id,
            'artifact_estimator_id': self.artifact_estimator_id,
            'probability_threshold': self.probability_threshold,
            'sample_annotations': {x.id: x.serialize() for x in self.sample_annotations.all()}
        })
        return res

    def get_runs(self, locus_id):
        channel_annotations = self.channel_annotations.join(Channel).filter(Channel.locus_id == locus_id).all()
        channel_annotations.sort(key=lambda x: x.channel.sample_id)
        runs = {}

        for sample_id, ca in groupby(channel_annotations, key=lambda x: x.channel.sample_id):
            runs[sample_id] = list(ca)

        return runs

    @staticmethod
    def select_best_run(channel_annotations, offscale_threshold):
        channel_annotations = [x for x in channel_annotations if not x.get_flag('poor_sizing_quality')]
        print len(channel_annotations)
        best_annotation = None
        for annotation in channel_annotations:
            if not annotation.annotated_peaks:
                annotation.annotated_peaks = []
            assert isinstance(annotation, ProjectChannelAnnotations)
            if not best_annotation:
                best_annotation = annotation
            else:
                best_peaks = filter(lambda y: y['peak_height'] < offscale_threshold and y['in_bin'],
                                    best_annotation.annotated_peaks)

                if best_peaks:
                    max_best_peak = max(best_peaks, key=lambda x: x['peak_height'])
                else:
                    max_best_peak = {'peak_height': 0}

                curr_peaks = filter(lambda y: y['peak_height'] < offscale_threshold and y['in_bin'],
                                    annotation.annotated_peaks)

                if curr_peaks:
                    max_curr_peak = max(curr_peaks, key=lambda x: x['peak_height'])
                else:
                    max_curr_peak = {'peak_height': 0}

                if max_curr_peak['peak_height'] > max_best_peak['peak_height']:
                    best_annotation = annotation
        return best_annotation

    def initialize_alleles(self, locus_id):
        locus_sample_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).filter(
            ProjectSampleAnnotations.project_id == self.id).filter(SampleLocusAnnotation.locus_id == locus_id).all()

        bin_ids = Bin.query.join(LocusBinSet).join(BinEstimatorProject).filter(
            BinEstimatorProject.id == self.bin_estimator_id).filter(
            LocusBinSet.locus_id == locus_id).values(Bin.id)

        bin_ids = [_[0] for _ in bin_ids]

        for annotation in locus_sample_annotations:
            assert isinstance(annotation, SampleLocusAnnotation)
            annotation.alleles = {}
            for bin_id in bin_ids:
                annotation.alleles[str(bin_id)] = False
        return self


class ProjectLocusParams(PeakScanner, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey("locus.id", ondelete="CASCADE"))
    project_id = db.Column(db.Integer, db.ForeignKey("project.id", ondelete="CASCADE"))
    locus = db.relationship('Locus', lazy='immediate')

    # Peak Filter Params
    min_peak_height = db.Column(db.Integer, default=150, nullable=False)
    max_peak_height = db.Column(db.Integer, default=40000, nullable=False)
    min_peak_height_ratio = db.Column(db.Float, default=0, nullable=False)
    max_bleedthrough = db.Column(db.Float, default=4, nullable=False)
    max_crosstalk = db.Column(db.Float, default=4, nullable=False)
    min_peak_distance = db.Column(db.Float, default=2, nullable=False)

    scanning_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)
    filter_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)

    discriminator = db.Column('type', db.String(255))
    __mapper_args__ = {'polymorphic_on': discriminator,
                       'polymorphic_identity': 'base_locus_params'}

    @property
    def filter_parameters(self):
        return {
            'min_peak_height': self.min_peak_height,
            'max_peak_height': self.max_peak_height,
            'min_peak_height_ratio': self.min_peak_height_ratio,
            'max_bleedthrough': self.max_bleedthrough,
            'max_crosstalk': self.max_crosstalk,
            'min_peak_distance': self.min_peak_distance
        }

    @staticmethod
    def stale_parameters(mapper, connection, target):
        assert isinstance(target, ProjectLocusParams)
        filter_params = target.filter_parameters.keys()
        scanning_params = target.scanning_parameters.keys()

        if params_changed(target, filter_params):
            target.filter_parameters_stale = True

        if params_changed(target, scanning_params):
            target.scanning_parameters_stale = True

        app.logger.debug("Filter Parameters Stale: {}".format(target.filter_parameters_stale))
        app.logger.debug("Scanning Parameters Stale: {}".format(target.scanning_parameters_stale))

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)

    def serialize(self):
        res = {
            'id': self.id,
            'locus_id': self.locus_id,
            'project_id': self.project_id,
            'filter_parameters_stale': self.filter_parameters_stale,
            'scanning_parameters_stale': self.scanning_parameters_stale
        }
        res.update(self.scanning_parameters)
        res.update(self.filter_parameters)
        return res

    def __repr__(self):
        return "<{} {} {}>".format(self.__class__.__name__, self.locus.label, self.locus.color)


class ArtifactEstimatorLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id'), primary_key=True)
    max_secondary_relative_peak_height = db.Column(db.Float, default=.4, nullable=False)
    min_artifact_peak_frequency = db.Column(db.Integer, default=10, nullable=False)
    artifact_estimator_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)

    @property
    def artifact_estimator_parameters(self):
        return {
            'max_secondary_relative_peak_height': self.max_secondary_relative_peak_height,
            'min_artifact_peak_frequency': self.min_artifact_peak_frequency
        }

    __mapper_args__ = {
        'polymorphic_identity': 'artifact_estimator_locus_params',
    }

    def serialize(self):
        res = super(ArtifactEstimatorLocusParams, self).serialize()
        res.update(self.artifact_estimator_parameters)
        return res

    @staticmethod
    def stale_parameters(mapper, connection, target):
        super(ArtifactEstimatorLocusParams, target).stale_parameters(mapper, connection, target)
        artifact_estimator_parameters = target.artifact_estimator_parameters.keys()

        if params_changed(target, artifact_estimator_parameters):
            target.artifact_estimator_parameters_stale = True

        app.logger.debug("Artifact Estimator Parameters Stale: {}".format(target.artifact_estimator_parameters_stale))


    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)


class GenotypingLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id'), primary_key=True)
    soft_artifact_sd_limit = db.Column(db.Float, default=3)
    hard_artifact_sd_limit = db.Column(db.Float, default=1)
    offscale_threshold = db.Column(db.Integer, default=32000, nullable=False)
    bleedthrough_filter_limit = db.Column(db.Float, default=2, nullable=False)
    crosstalk_filter_limit = db.Column(db.Float, default=2, nullable=False)
    relative_peak_height_limit = db.Column(db.Float, default=0.01, nullable=False)
    absolute_peak_height_limit = db.Column(db.Integer, default=50, nullable=False)
    failure_threshold = db.Column(db.Integer, default=500, nullable=False)

    genotyping_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)

    @property
    def genotyping_parameters(self):
        return {
            'soft_artifact_sd_limit': self.soft_artifact_sd_limit,
            'hard_artifact_sd_limit': self.hard_artifact_sd_limit,
            'offscale_threshold': self.offscale_threshold,
            'bleedthrough_filter_limit': self.bleedthrough_filter_limit,
            'crosstalk_filter_limit': self.crosstalk_filter_limit,
            'relative_peak_height_limit': self.relative_peak_height_limit,
            'absolute_peak_height_limit': self.absolute_peak_height_limit,
            'failure_threshold': self.failure_threshold
        }


    __mapper_args__ = {
        'polymorphic_identity': 'genotyping_locus_params',
    }

    def serialize(self):
        res = super(GenotypingLocusParams, self).serialize()
        res.update(self.genotyping_parameters)
        return res

    @staticmethod
    def stale_parameters(mapper, connection, target):
        super(GenotypingLocusParams, target).stale_parameters(mapper, connection, target)
        genotyping_parameters = target.genotyping_parameters.keys()

        if params_changed(target, genotyping_parameters):
            target.genotyping_parameters_stale = True

        app.logger.debug("Genotyping Parameters Stale: {}".format(target.genotyping_parameters_stale))

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)


class BinEstimatorLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id'), primary_key=True)
    min_peak_frequency = db.Column(db.Integer, default=10, nullable=False)
    default_bin_buffer = db.Column(db.Float, default=.75, nullable=False)
    bin_estimator_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)

    @property
    def bin_estimator_parameters(self):
        return {
            'min_peak_frequency': self.min_peak_frequency,
            'default_bin_buffer': self.default_bin_buffer
        }

    __mapper_args__ = {
        'polymorphic_identity': 'bin_estimator_locus_params'
    }

    def serialize(self):
        res = super(BinEstimatorLocusParams, self).serialize()
        res.update(self.bin_estimator_parameters)
        return res

    @staticmethod
    def stale_parameters(mapper, connection, target):
        super(BinEstimatorLocusParams, target).stale_parameters(mapper, connection, target)
        bin_estimator_parameters = target.bin_estimator_parameters.keys()

        if params_changed(target, bin_estimator_parameters):
            target.bin_estimator_parameters_stale = True

        app.logger.debug("Bin Estimator Parameters Stale: {}".format(target.bin_estimator_parameters_stale))

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)


class ProjectChannelAnnotations(TimeStamped, Flaggable, db.Model):
    """
    Channel level analysis in a project.
    """
    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channel.id", ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id", ondelete="CASCADE"), index=True)
    channel = db.relationship('Channel', lazy='select')
    annotated_peaks = db.Column(MutableList.as_mutable(JSONEncodedData), default=[])
    peak_indices = db.Column(MutableList.as_mutable(JSONEncodedData))
    __table_args__ = (db.UniqueConstraint('project_id', 'channel_id', name='_project_channel_uc'),)

    def serialize(self):
        res = {
            'id': self.id,
            'channel_id': self.channel_id,
            'project_id': self.project_id,
            'annotated_peaks': self.annotated_peaks or [],
            'last_updated': self.last_updated,
            'locus_id': self.channel.locus_id,
            'sample_id': self.channel.sample_id
        }
        return res


class ProjectSampleAnnotations(TimeStamped, db.Model):
    """
    Sample level analysis in a project.
    """
    id = db.Column(db.Integer, primary_key=True)
    sample_id = db.Column(db.Integer, db.ForeignKey('sample.id', ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id', ondelete="CASCADE"), index=True)
    locus_annotations = db.relationship('SampleLocusAnnotation', backref=db.backref('sample_annotation'),
                                        # lazy='dynamic',
                                        cascade='save-update, merge, delete, delete-orphan')
    sample = db.relationship('Sample', lazy='select')
    moi = db.Column(db.Integer)
    __table_args__ = (db.UniqueConstraint('project_id', 'sample_id', name='_project_sample_uc'),)

    def serialize(self):
        res = {
            'id': self.id,
            'sample': self.sample.serialize(),
            'project_id': self.project_id,
            'moi': self.moi,
            'last_updated': self.last_updated,
        }
        return res

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'locus_annotations': {x.locus_id: x.serialize() for x in self.locus_annotations}
        })
        return res


class SampleLocusAnnotation(TimeStamped, Flaggable, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"))
    sample_annotations_id = db.Column(db.Integer, db.ForeignKey("project_sample_annotations.id", ondelete="CASCADE"),
                                      index=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"), index=True)
    locus = db.relationship('Locus', lazy='immediate')
    annotated_peaks = db.Column(MutableList.as_mutable(JSONEncodedData), default=[])
    reference_run_id = db.Column(db.Integer, db.ForeignKey('project_channel_annotations.id'), index=True)
    reference_run = db.relationship('ProjectChannelAnnotations', lazy='select')
    alleles = db.Column(MutableDict.as_mutable(JSONEncodedData))

    def __init__(self, locus_id, project_id):
        self.locus_id = locus_id
        self.project_id = project_id

    def serialize(self):
        res = {
            'id': self.id,
            'sample_annotations_id': self.sample_annotations_id,
            'locus_id': self.locus_id,
            'annotated_peaks': self.annotated_peaks,
            'reference_run_id': self.reference_run_id,
            'reference_channel_id': None,
            'alleles': self.alleles,
            'flags': self.flags,
            'comments': self.comments
        }

        if self.reference_run:
            res.update({
                'reference_channel_id': self.reference_run.channel_id,
            })

        return res


# Locus Set Association table
locus_set_association_table = db.Table('locus_set_association',
                                       db.Column('locus_id', db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE")),
                                       db.Column('locus_set_id', db.Integer,
                                                 db.ForeignKey('locus_set.id', ondelete="CASCADE"))
                                       )


class LocusSet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    loci = db.relationship('Locus', secondary=locus_set_association_table)
    label = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return "<LocusSet {}>".format(self.label)

    def serialize(self):
        res = {
            'id': self.id,
            'label': self.label,
            'loci': {locus.id: locus.serialize() for locus in self.loci}
        }
        return res


class Locus(Colored, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(255), unique=True, nullable=False)
    max_base_length = db.Column(db.Integer, nullable=False)
    min_base_length = db.Column(db.Integer, nullable=False)
    nucleotide_repeat_length = db.Column(db.Integer, default=3, nullable=False)
    locus_metadata = db.Column(MutableDict.as_mutable(JSONEncodedData), default={}, nullable=False)

    def __repr__(self):
        return "<Locus {} {}>".format(self.label, self.color.capitalize())

    def serialize(self):
        res = {
            'id': self.id,
            'label': self.label,
            'max_base_length': self.max_base_length,
            'min_base_length': self.min_base_length,
            'nucleotide_repeat_length': self.nucleotide_repeat_length,
            'locus_matadata': self.locus_metadata,
            'color': self.color
        }
        return res


class Ladder(PeakScanner, Colored, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(255), unique=True, nullable=False, index=True)
    base_sizes = db.Column(MutableList.as_mutable(JSONEncodedData), nullable=False)

    sq_limit = db.Column(db.Float, default=1, nullable=False)
    unusable_sq_limit = db.Column(db.Float, default=10, nullable=False)
    base_size_precision = db.Column(db.Integer, default=2, nullable=False)

    index_overlap = db.Column(db.Integer, default=15, nullable=False)
    min_time = db.Column(db.Integer, default=1200, nullable=False)
    max_peak_height = db.Column(db.Integer, default=12000, nullable=False)
    min_peak_height = db.Column(db.Integer, default=200, nullable=False)
    outlier_limit = db.Column(db.Integer, default=3, nullable=False)
    maximum_missing_peak_count = db.Column(db.Integer, default=5, nullable=False)
    allow_bleedthrough = db.Column(db.Boolean, default=True, nullable=False)
    remove_outliers = db.Column(db.Boolean, default=True, nullable=False)

    def __repr__(self):
        return "<Ladder {} {}>".format(self.label, self.color.capitalize())

    @property
    def filter_parameters(self):
        return {
            'index_overlap': self.index_overlap,
            'min_time': self.min_time,
            'max_peak_height': self.max_peak_height,
            'min_peak_height': self.min_peak_height,
            'outlier_limit': self.outlier_limit,
            'maximum_missing_peak_count': self.maximum_missing_peak_count,
            'allow_bleedthrough': self.allow_bleedthrough,
            'remove_outliers': self.remove_outliers,
        }

    def serialize(self):
        res = {
            'id': self.id,
            'label': self.label,
            'base_sizes': self.base_sizes,
            'sq_limit': self.sq_limit,
            'base_size_precision': self.base_size_precision,
            'color': self.color
        }
        res.update(self.filter_parameters)
        res.update(self.scanning_parameters)
        return res


class Plate(PlateExtractor, TimeStamped, Flaggable, db.Model):
    """
    Immutable data about plate sourced from zip of FSA Files
    """
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(255), unique=True, nullable=False, index=True)
    creator = db.Column(db.String(255), nullable=True)
    date_processed = db.Column(db.DateTime, default=datetime.utcnow)
    date_run = db.Column(db.Date, nullable=False)
    well_arrangement = db.Column(db.Integer, nullable=False, default=96)
    ce_machine = db.Column(db.String(255), default="Unknown")
    wells = db.relationship('Well', backref=db.backref('plate'), cascade='save-update, merge, delete, delete-orphan')
    plate_hash = db.Column(db.String(32), nullable=False, unique=True, index=True)

    def __repr__(self):
        return "<Plate {0}>".format(self.label)

    @validates('well_arrangement')
    def validate_well_arrangement(self, key, well_arrangement):
        assert well_arrangement in [96, 384]
        return well_arrangement

    @reconstructor
    def init_on_load(self):
        super(Plate, self).__init__(label=self.label, well_arrangement=self.well_arrangement, wells=self.wells,
                                    date_run=self.date_run, creator=self.creator, comments=self.comments,
                                    ce_machine=self.ce_machine, plate_hash=self.plate_hash)

    @classmethod
    def get_serialized_list(cls):
        plates = cls.query.values(cls.id, cls.label, cls.creator, cls.date_processed, cls.date_run,
                                  cls.well_arrangement, cls.ce_machine, cls.plate_hash, cls.last_updated, cls.flags)
        plates = [{'id': p[0],
                   'label': p[1],
                   'creator': p[2],
                   'date_processed': str(p[3]),
                   'date_run': str(p[4]),
                   'well_arrangement': str(p[5]),
                   'ce_machine': str(p[6]),
                   'plate_hash': str(p[7]),
                   'last_updated': str(p[8]),
                   'flags': p[9]} for p in plates]
        return plates

    @classmethod
    def from_zip(cls, zip_file, ladder_id, creator=None, comments=None, block_flush=False):
        extracted_plate = PlateExtractor.from_zip(zip_file, creator, comments)

        ladder = Ladder.query.get(ladder_id)
        extracted_plate = extracted_plate.calculate_base_sizes(ladder=ladder.base_sizes, color=ladder.color,
                                                               base_size_precision=ladder.base_size_precision,
                                                               sq_limit=ladder.sq_limit,
                                                               filter_parameters=ladder.filter_parameters,
                                                               scanning_parameters=ladder.scanning_parameters)

        p = cls(label=extracted_plate.label, comments=extracted_plate.comments, creator=extracted_plate.creator,
                date_run=extracted_plate.date_run, well_arrangement=extracted_plate.well_arrangement,
                ce_machine=extracted_plate.ce_machine, plate_hash=extracted_plate.plate_hash)

        db.session.add(p)
        db.session.flush()

        for well in extracted_plate.wells:
            w = Well(well_label=well.well_label, comments=well.comments, base_sizes=well.base_sizes,
                     ladder_peak_indices=well.ladder_peak_indices, sizing_quality=well.sizing_quality,
                     offscale_indices=well.offscale_indices, fsa_hash=well.fsa_hash)

            w.plate_id = p.id
            w.ladder_id = ladder.id
            db.session.add(w)
            db.session.flush()
            for channel in well.channels:
                c = Channel(wavelength=channel.wavelength, data=channel.data, color=channel.color)
                c.well_id = w.id
                db.session.add(c)
            db.session.flush()
        return p.id

    @classmethod
    def from_zips(cls, zip_files, ladder_id, creator=None, comments=None):
        plate_ids = []
        for z in zip_files:
            plate_ids.append(cls.from_zip(z, ladder_id, creator, comments))
        return plate_ids

    def load_plate_map(self, plate_map_file):
        r = csv.DictReader(plate_map_file)
        locus_labels = r.fieldnames
        print locus_labels
        locus_labels = [x for x in locus_labels if x.lower() not in ['', 'well']]
        print locus_labels
        for entry in r:
            print entry
            well_label = entry['Well']
            for locus_label in locus_labels:
                sample_barcode = entry[locus_label]
                sample = Sample.query.filter(Sample.barcode == sample_barcode).one()
                locus = Locus.query.filter(Locus.label == locus_label).one()
                well = self.wells_dict[well_label]
                channel = well.channels_dict[locus.color]
                if channel and locus and sample:
                    channel.add_locus(locus.id)
                    channel.add_sample(sample.id)
        return self

    def check_contamination(self):
        self.set_flag('contamination_count', 0)
        channels = Channel.query.join(Well).join(Plate).join(Sample).filter(Plate.id == self.id) \
            .filter(Sample.designation == 'negative_control').all()
        for channel in channels:
            channel.check_contamination()
        return self

    def set_contamination_flag(self, wavelength):
        print "Setting Contamination Flag for " + self.label + " At " + str(wavelength)
        if self.get_flag('contamination_count', None):
            self.set_flag('contamination_count', self.get_flag('contamination_count') + 1)
        else:
            self.set_flag('contamination_count', 1)
        channels = Channel.query.join(Well).join(Plate).filter(Plate.id == self.id).filter(
            Channel.wavelength == wavelength).all()
        for channel in channels:
            channel.set_flag('contamination', True)
        return self

    def unset_contamination_flag(self, wavelength):
        if self.get_flag('contamination_count', None):
            self.set_flag('contamination_count', self.get_flag('contamination_count') - 1)
            channels = Channel.query.join(Plate).filter(Plate.id == self.id).filter(
                Channel.wavelength == wavelength).all()
            for channel in [_ for _ in channels if _.designation == 'negative_control']:
                if channel.flags.get('contamination', None):
                    return self

            for channel in [_ for _ in channels if _.designation != 'negative_control']:
                channel.flags.set('contamination', False)
        self.set_flag('contamination_count', 0)
        return self

    def serialize(self):
        return {
            'id': self.id,
            'label': self.label,
            'creator': self.creator,
            'date_processed': str(self.date_processed),
            'date_run': str(self.date_run),
            'well_arrangement': self.well_arrangement,
            'ce_machine': self.ce_machine,
            'plate_hash': self.plate_hash,
            'last_updated': str(self.last_updated),
            'wells': {w.well_label: w.serialize() for w in self.wells}
        }


class Well(WellExtractor, TimeStamped, Flaggable, db.Model):
    """
    Immutable data about well sourced from FSA Files, apart from ladder used.
    """
    id = db.Column(db.Integer, primary_key=True)
    plate_id = db.Column(db.Integer, db.ForeignKey("plate.id", ondelete="CASCADE"), nullable=False)
    well_label = db.Column(db.String(3), nullable=False)
    base_sizes = deferred(db.Column(MutableList.as_mutable(JSONEncodedData)))
    ladder_peak_indices = db.Column(MutableList.as_mutable(JSONEncodedData))
    sizing_quality = db.Column(db.Float, default=1000)
    channels = db.relationship('Channel', backref=db.backref('well'),
                               cascade='save-update, merge, delete, delete-orphan')
    offscale_indices = db.Column(MutableList.as_mutable(JSONEncodedData))
    ladder_id = db.Column(db.Integer, db.ForeignKey('ladder.id'), nullable=False)
    ladder = db.relationship('Ladder')
    fsa_hash = db.Column(db.String(32), nullable=False, unique=True, index=True)
    _channels_dict = None

    def __repr__(self):
        if self.sizing_quality:
            return "<Well {0} {1}>".format(self.well_label, round(self.sizing_quality, 2))
        else:
            return "<Well {0}>".format(self.well_label)

    @reconstructor
    def init_on_load(self):
        super(Well, self).__init__(well_label=self.well_label, comments=self.comments, base_sizes=self.base_sizes,
                                   sizing_quality=self.sizing_quality, offscale_indices=self.offscale_indices,
                                   ladder_peak_indices=self.ladder_peak_indices, channels=self.channels,
                                   fsa_hash=self.fsa_hash)

    def calculate_base_sizes(self, peak_indices=None):
        ladder = self.ladder.base_sizes
        color = self.ladder.color
        base_size_precision = self.ladder.base_size_precision
        sq_limit = self.ladder.sq_limit
        filter_parameters = self.ladder.filter_parameters
        scanning_parameters = self.ladder.scanning_parameters
        super(Well, self).calculate_base_sizes(ladder=ladder, color=color, peak_indices=peak_indices,
                                               base_size_precision=base_size_precision,
                                               sq_limit=sq_limit, filter_parameters=filter_parameters,
                                               scanning_parameters=scanning_parameters)
        for channel in self.channels:
            channel.annotate_base_sizes()
        return self

    def serialize(self):
        return {
            'id': self.id,
            'plate_id': self.plate_id,
            'well_label': self.well_label,
            'sizing_quality': self.sizing_quality,
            'last_updated': str(self.last_updated),
            'offscale_indices': self.offscale_indices,
            'ladder_id': self.ladder_id,
            'fsa_hash': self.fsa_hash,
            'channels': {channel.color: channel.serialize() for channel in self.channels},
            'ladder_peak_indices': None,
            'base_sizes': None
        }

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'ladder_peak_indices': self.ladder_peak_indices,
            'base_sizes': self.base_sizes
        })
        return res


class Channel(ChannelExtractor, TimeStamped, Colored, Flaggable, db.Model):
    """
    Immutable data about channel within an FSA File
    """
    id = db.Column(db.Integer, primary_key=True)
    well_id = db.Column(db.Integer, db.ForeignKey("well.id", ondelete="CASCADE"))
    wavelength = db.Column(db.Integer, nullable=False)
    data = deferred(db.Column(MutableList.as_mutable(JSONEncodedData)))
    max_data_point = db.Column(db.Integer, default=0)

    sample_id = db.Column(db.Integer, db.ForeignKey('sample.id'))
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id'))
    locus = db.relationship('Locus')

    def __repr__(self):
        if self.locus:
            return "<Channel {} {}>".format(self.locus.label, self.color.capitalize())
        else:
            return "<Channel {}>".format(self.color)

    @reconstructor
    def init_on_load(self):
        super(Channel, self).__init__(color=self.color, wavelength=self.wavelength)

    def filter_to_locus_range(self):
        self.filter_annotated_peaks(
            base_size_filter(min_size=self.locus.min_base_length, max_size=self.locus.max_base_length))

    def pre_annotate_and_filter(self, filter_params):
        self.annotate_base_sizes()
        self.filter_to_locus_range()
        self.annotate_peak_heights()
        self.filter_annotated_peaks(peak_height_filter(min_height=filter_params['min_peak_height'],
                                                       max_height=filter_params['max_peak_height']))
        self.annotate_bleedthrough()
        self.filter_annotated_peaks(bleedthrough_filter(max_bleedthrough_ratio=filter_params['max_bleedthrough']))
        self.annotate_crosstalk()
        self.filter_annotated_peaks(crosstalk_filter(max_crosstalk_ratio=filter_params['max_crosstalk']))
        self.filter_annotated_peaks(peak_proximity_filter(min_peak_distance=filter_params['min_peak_distance']))
        self.annotate_peak_area()

    def post_annotate_peaks(self):
        self.annotate_relative_peak_heights()
        self.annotate_relative_peak_area()

    def post_filter_peaks(self, filter_params):
        self.filter_annotated_peaks(
            relative_peak_height_filter(min_relative_peak_height=filter_params['min_peak_height_ratio']))

    def add_sample(self, sample_id):
        self.sample_id = sample_id
        return self

    def add_locus(self, locus_id):
        locus = Locus.query.get(locus_id)
        self.locus = locus
        self.locus_id = locus_id
        self.find_max_data_point()
        return self

    def find_max_data_point(self):
        if self.locus and self.well.ladder_peak_indices:
            self.well.ladder_peak_indices.sort()
            j = 0
            while self.well.base_sizes[self.well.ladder_peak_indices[j]] < self.locus.min_base_length:
                j += 1
            i = self.well.ladder_peak_indices[j - 1]
            while self.well.base_sizes[i] < self.locus.max_base_length:
                i += 1
                if self.well.base_sizes[i] > self.locus.min_base_length:
                    if self.data[i] > self.max_data_point:
                        self.max_data_point = self.data[i]

    def check_contamination(self):
        if self.sample.designation == 'negative_control':
            print self.max_data_point
            if self.max_data_point > Config.CONTAMINATION_LIMIT:
                self.set_flag('contamination', True)
                self.well.plate.set_contamination_flag(self.wavelength)

    def unset_contamination_flag(self):
        if self.get_flag('contamination', False):
            self.set_flag('contamination', False)
            if self.sample.designation == 'negative_control':
                self.well.plate.unset_contamination_flag(self.wavelength)

    def serialize(self):
        res = {
            'id': self.id,
            'well_id': self.well_id,
            'wavelength': self.wavelength,
            'sample_id': self.sample_id,
            'locus_id': self.locus_id,
            'max_data_point': self.max_data_point,
            'data': None
        }
        return res

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'data': self.data
        })
        return res
