import csv
from collections import defaultdict
from datetime import datetime
from itertools import groupby

from app.microspat.statistics import calculate_moi
from app.microspat.statistics.utils import calculate_prob_negative, calculate_prob_pos_if_observed
from quantification_bias.BiasCalculator import correct_peak_proportion, calculate_beta
from config import Config

# from sklearn.externals import joblib
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.orm import validates, deferred, reconstructor, joinedload, subqueryload, undefer
from sqlalchemy import event
from sqlalchemy.orm.util import object_state
from sqlalchemy.orm.session import attributes, make_transient

from sqlalchemy.engine import Engine

from app import db, socketio
from flask import current_app as app
from flask_sqlalchemy import SignallingSession

from fsa_extractor.PlateExtractor import PlateExtractor, WellExtractor, ChannelExtractor
from statistics import calculate_allele_frequencies, calculate_peak_probability
import bin_finder.BinFinder as BinFinder
import artifact_estimator.ArtifactEstimator as AE

import eventlet

from ..custom_sql_types.custom_types import JSONEncodedData, MutableDict, MutableList, CompressedJSONEncodedData
from peak_annotator.PeakFilters import *


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
        #TODO: add index to sqlite
        return db.Column(db.Integer, db.ForeignKey('locus_set.id'), nullable=False, index=True)

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

    #
    # __mapper_args__ = {'polymorphic_on': designation,
    #                    'polymorphic_identity': 'sample'}

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

    def __repr__(self):
        return "<{} {}>".format(self.__class__.__name__, self.barcode)


class InvalidAllelesException(Exception):
    pass


class Control(TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    barcode = db.Column(db.String(255), nullable=False)
    bin_estimator_id = db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id'), index=True, nullable=False)
    bin_estimator = db.relationship('BinEstimatorProject')
    alleles = db.Column(MutableDict.as_mutable(JSONEncodedData))

    __table_args__ = (db.UniqueConstraint('barcode', 'bin_estimator_id', name='_barcode_bin_estimator_uc'),)

    def __init__(self, barcode, bin_estimator_id):
        bin_estimator = BinEstimatorProject.query.get_or_404(bin_estimator_id)

        assert isinstance(bin_estimator, BinEstimatorProject)
        self.bin_estimator_id = bin_estimator_id
        self.bin_estimator = bin_estimator
        self.barcode = barcode
        self.initialize_alleles()

    def initialize_alleles(self):
        self.alleles = {}
        for bin_set in self.bin_estimator.locus_bin_sets:
            assert isinstance(bin_set, LocusBinSet)
            self.alleles[str(bin_set.locus_id)] = None
        return self

    def set_alleles(self, alleles):
        if self.alleles_valid(alleles):
            self.alleles = alleles
        else:
            raise InvalidAllelesException()
        return self

    def alleles_valid(self, alleles):
        valid_locus_ids = [str(_.id) for _ in self.bin_estimator.locus_set.loci]
        for locus_id in alleles.keys():
            if str(locus_id) in valid_locus_ids:
                be_bin_set = next((_ for _ in self.bin_estimator.locus_bin_sets if _.locus_id == int(locus_id)), None)
                if be_bin_set:
                    valid_bin_ids = [str(_.id) for _ in be_bin_set.bins]
                    if alleles[locus_id] and str(alleles[locus_id]) not in valid_bin_ids:
                        return False
                else:
                    return False
            else:
                return False
        return True

    def serialize(self):
        return {
            'id': self.id,
            'barcode': self.barcode,
            'bin_estimator_id': self.bin_estimator_id,
            'bin_estimator': self.bin_estimator.serialize(),
            'alleles': self.alleles
        }

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'bin_estimator': self.bin_estimator.serialize_details()
        })
        return res

    def __repr__(self):
        return "<{} {}>".format(self.__class__.__name__, self.barcode)


class Project(LocusSetAssociatedMixin, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), unique=True, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    creator = db.Column(db.String(255))
    description = db.Column(db.Text, nullable=True)
    channel_annotations = db.relationship('ProjectChannelAnnotations', backref=db.backref('project'), lazy='dynamic')
    discriminator = db.Column('type', db.String(255))
    __mapper_args__ = {'polymorphic_on': discriminator,
                       'polymorphic_identity': 'base_project'}

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

        map(db.session.expunge, locus_params)
        map(make_transient, locus_params)
        map(lambda _: setattr(_, 'id', None), locus_params)

        map(db.session.expunge, channel_annotations)
        map(make_transient, channel_annotations)
        map(lambda _: setattr(_, 'old_id', _.id), channel_annotations)
        map(lambda _: setattr(_, 'id', None), channel_annotations)

        db.session.add(project)
        db.session.flush()

        map(lambda _: setattr(_, 'project_id', project.id), locus_params)
        map(lambda _: setattr(_, 'project', project), channel_annotations)

        map(db.session.add, locus_params)
        map(db.session.add, channel_annotations)

        db.session.flush()

        return project

    @property
    def associated_samples(self):
        samples = Sample.query.join(Channel).join(ProjectChannelAnnotations).join(Project).filter(
            Project.id == self.id).all()

        return samples

    @property
    def locus_parameters(self):
        raise NotImplementedError("Project should not be directly initialized.")

    def filter_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Project should not be directly initialized")

    def scanning_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Project should not be directly initialized")

    @reconstructor
    def init_on_load(self):
        self._locus_param_cache = {}

    def __init__(self, locus_set_id, **kwargs):
        super(Project, self).__init__(**kwargs)
        locus_set = LocusSet.query.get(locus_set_id)
        self.locus_set = locus_set
        self._locus_param_cache = {}
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

        return channel_annotation

    def add_channels(self, channel_ids):
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

        channel_annotations = self.bulk_create_channel_annotations(channel_ids)

        return channel_annotations

    def create_channel_annotation(self, channel_id):
        channel_annotation = ProjectChannelAnnotations(channel_id=channel_id)
        self.channel_annotations.append(channel_annotation)
        return channel_annotation

    def bulk_create_channel_annotations(self, channel_ids):
        objs = []
        for channel_id in channel_ids:
            objs.append(ProjectChannelAnnotations(channel_id=channel_id, project_id=self.id))
        db.session.bulk_save_objects(objs)
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
                eventlet.sleep()
                channel.post_annotate_peaks()
                channel.post_filter_peaks(filter_params)
                total_peaks = len(channel.peaks)

            channel_annotation.annotated_peaks = channel.peaks[:]

        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks):
        recalculated_channel_annotations = []
        for channel_annotation in channel_annotations:
            eventlet.sleep()
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
        app.logger.debug("Recalculating Locus {} for project {}".format(locus_parameters.locus.label, self.title))
        app.logger.debug("Scanning Parameters Stale: {}".format(locus_parameters.scanning_parameters_stale))
        app.logger.debug("Filter Parameters Stale: {}".format(locus_parameters.filter_parameters_stale))
        channel_annotations = self.get_locus_channel_annotations(locus_id, append_well=True)
        if locus_parameters.scanning_parameters_stale:
            channel_annotations = self.recalculate_channels(channel_annotations=channel_annotations,
                                                            rescan_peaks=True)
        else:
            if locus_parameters.filter_parameters_stale:
                channel_annotations = self.recalculate_channels(
                    channel_annotations=channel_annotations,
                    rescan_peaks=False)

        locus_parameters.scanning_parameters_stale = False
        locus_parameters.filter_parameters_stale = False

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

    def bin_estimator_changed(self, locus_id):
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

    def artifact_estimator_changed(self, locus_id):
        raise NotImplementedError("Must be implemented by the user")

    def clear_artifact_annotations(self, channel_annotations):
        for annotation in channel_annotations:
            assert isinstance(annotation, ProjectChannelAnnotations)
            if annotation.annotated_peaks:
                for peak in annotation.annotated_peaks:
                    peak['artifact_contribution'] = 0
                    peak['artifact_error'] = 0
        return self


class QuantificationBiasEstimating(object):
    @declared_attr
    def quantification_bias_estimator_id(self):
        return db.Column(db.Integer, db.ForeignKey('quantification_bias_estimator_project.id'), index=True)

    @declared_attr
    def quantification_bias_estimator(self):
        return db.relationship('QuantificationBiasEstimatorProject', lazy='select',
                               foreign_keys=[self.quantification_bias_estimator_id])

    def quantification_bias_estimator_changed(self, locus_id):
        raise NotImplementedError("Must be implemented by the user")

    def clear_quantification_bias_annotations(self, locus_annotations):
        for annotation in locus_annotations:
            assert isinstance(annotation, SampleLocusAnnotation)
            if annotation.annotated_peaks:
                for peak in annotation.annotated_peaks:
                    peak['relative_quantification'] = None
                    peak['corrected_relative_quantification'] = None
        return self


class SampleBasedProject(Project, BinEstimating):
    id = db.Column(db.Integer, db.ForeignKey('project.id'), primary_key=True)
    __mapper_args__ = {'polymorphic_identity': 'sample_based_project'}

    @classmethod
    def copy_project(cls, project):
        assert isinstance(project, cls)

        reference_run_map = {}

        sample_annotations = project.sample_annotations.all()
        for sa in sample_annotations:
            assert isinstance(sa, ProjectSampleAnnotations)
            for la in sa.locus_annotations:
                la.old_ref_id = la.reference_run_id
                assert isinstance(la, SampleLocusAnnotation)
                reference_run_map[(sa.sample_id, la.locus_id)] = la.reference_run_id

        sample_annotations = map(ProjectSampleAnnotations.copy_project_sample_annotations, sample_annotations)

        project = super(SampleBasedProject, cls).copy_project(project)

        project.sample_annotations = sample_annotations

        old_ref_map = {}
        for ca in project.channel_annotations.all():
            old_ref_map[ca.old_id] = ca

        for sa in sample_annotations:
            assert isinstance(sa, ProjectSampleAnnotations)
            for la in sa.locus_annotations:
                assert isinstance(la, SampleLocusAnnotation)
                ref_run = reference_run_map[(sa.sample_id, la.locus_id)]
                if ref_run:
                    la.reference_run = old_ref_map[ref_run]
                la.project_id = project.id

        db.session.flush()

        return project

    @declared_attr
    def sample_annotations(self):
        return db.relationship('ProjectSampleAnnotations', backref=db.backref('project'), lazy='dynamic',
                               cascade='save-update, merge')

    @property
    def locus_parameters(self):
        raise NotImplementedError("Sample Based Project should not be directly initialized.")

    def scanning_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Sample Based Project should not be directly initialized")

    def filter_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Sample Based Project should not be directly initialized")

    def add_sample(self, sample_id):
        sample_annotation = ProjectSampleAnnotations(sample_id=sample_id)
        self.sample_annotations.append(sample_annotation)

        channel_ids = Channel.query.join(Sample).join(Locus).join(locus_set_association_table).join(LocusSet).join(
            Project).filter(
            Project.id == self.id).filter(Sample.id == sample_id).values(Channel.id)

        self.add_channels([str(x[0]) for x in channel_ids])

        for locus in self.locus_set.loci:
            locus_sample_annotation = SampleLocusAnnotation(locus_id=locus.id, project_id=self.id)
            bin_ids = Bin.query.join(LocusBinSet).join(BinEstimatorProject).filter(
                BinEstimatorProject.id == self.bin_estimator_id).filter(LocusBinSet.locus_id == locus.id).values(Bin.id)
            locus_sample_annotation.alleles = dict([(str(bin_id[0]), False) for bin_id in bin_ids])
            sample_annotation.locus_annotations.append(locus_sample_annotation)

        return sample_annotation

    def add_samples(self, sample_ids):
        present_sample_ids = set([_.id for _ in self.associated_samples])
        print present_sample_ids
        print set(sample_ids)
        full_sample_ids = list(set(sample_ids) - present_sample_ids)
        print full_sample_ids
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
            self.bulk_create_channel_annotations(channel_ids)
            db.session.flush()
            n += 1
        locus_params = self.locus_parameters.all()
        for lp in locus_params:
            lp.filter_parameters_stale = True
            lp.scanning_parameters_stale = True
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
                    channel_annotation.channel.locus_id,
                    channel_annotation.annotated_peaks)
                channel_annotation.annotated_peaks.changed()

    def recalculate_channel(self, channel_annotation, rescan_peaks):
        eventlet.sleep()
        channel_annotation = super(SampleBasedProject, self).recalculate_channel(channel_annotation, rescan_peaks)

        self.annotate_channel(channel_annotation)
        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks):
        channel_annotations = super(SampleBasedProject, self).recalculate_channels(channel_annotations, rescan_peaks)

        for channel_annotation in channel_annotations:
            self.annotate_channel(channel_annotation)
        return channel_annotations

    def serialize(self):
        res = super(SampleBasedProject, self).serialize()
        res.update({
            'bin_estimator_id': self.bin_estimator_id,
            'sample_annotations': []
        })
        return res

    def get_locus_sample_annotations(self, locus_id):
        """
        :param locus_id: int
        :return: list[SampleLocusAnnotation]
        """
        return SampleLocusAnnotation.query.filter(SampleLocusAnnotation.locus_id == locus_id) \
            .filter(SampleLocusAnnotation.project_id == self.id).all()

    def serialize_details(self):
        res = super(SampleBasedProject, self).serialize_details()
        sample_annotations = self.sample_annotations.all()
        res.update({
            'bin_estimator_id': self.bin_estimator_id,
            'sample_annotations': [sample_annotation.serialize() for sample_annotation in sample_annotations]
        })
        return res

    def bin_estimator_changed(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        lp.set_filter_parameters_stale()
        self.clear_locus_bin_annotations(locus_id)
        self.initialize_alleles(locus_id)
        return self

    def clear_locus_bin_annotations(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        self.clear_bin_annotations(channel_annotations)
        self.clear_sample_annotations(locus_id)
        return self

    def clear_sample_annotations(self, locus_id):
        sample_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).filter(
            SampleLocusAnnotation.locus_id == locus_id).filter(ProjectSampleAnnotations.project_id == self.id).all()
        for sample_annotation in sample_locus_annotations:
            assert isinstance(sample_annotation, SampleLocusAnnotation)
            sample_annotation.annotated_peaks = []
            sample_annotation.reference_run_id = None
            sample_annotation.clear_flags()
        return self

    def analyze_samples(self, locus_id):
        raise NotImplementedError("Sample Based Project should not be directly initialized")

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
        """
        Clear all allele calls for a given locus
        """
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


class BinEstimatorProject(Project):
    # Collection of channels used to generate bins
    id = db.Column(db.Integer, db.ForeignKey('project.id'), primary_key=True)

    locus_bin_sets = db.relationship('LocusBinSet', lazy='immediate',
                                     cascade='save-update, merge, delete, expunge, delete-orphan')

    locus_parameters = db.relationship('BinEstimatorLocusParams', backref=db.backref('bin_estimator_project'),
                                       lazy='dynamic', cascade='save-update, merge, delete, expunge, delete-orphan')

    __mapper_args__ = {'polymorphic_identity': 'bin_estimator_project'}

    @classmethod
    def copy_project(cls, project):
        locus_bin_sets = project.locus_bin_sets
        locus_bin_sets = map(LocusBinSet.copy_locus_bin_set, locus_bin_sets)

        project = super(BinEstimatorProject, cls).copy_project(project)

        project.locus_bin_sets = locus_bin_sets

        db.session.flush()

        return project

    def parameters_changed(self, locus_id):
        gp_projects = GenotypingProject.query.filter(GenotypingProject.bin_estimator_id == self.id).all()
        art_projects = ArtifactEstimatorProject.query.filter(ArtifactEstimatorProject.bin_estimator_id == self.id).all()
        controls = Control.query.filter(Control.bin_estimator_id == self.id).all()
        for project in gp_projects:
            assert isinstance(project, GenotypingProject)
            project.bin_estimator_changed(locus_id)
        for project in art_projects:
            assert isinstance(project, ArtifactEstimatorProject)
            project.bin_estimator_changed(locus_id)
        for control in controls:
            assert isinstance(control, Control)
            control.initialize_alleles()

    def filter_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def scanning_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def bin_estimator_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def calculate_locus_bin_set(self, locus_id):
        locus = Locus.query.get(locus_id)
        if locus not in self.locus_set.loci:
            raise ValueError("{} is not a member of this project's analysis set.".format(locus.label))

        self.delete_locus_bin_set(locus_id)

        locus_parameters = self.get_locus_parameters(locus_id)

        annotations = ProjectChannelAnnotations.query.join(Channel).filter(
            ProjectChannelAnnotations.project_id == self.id).filter(Channel.locus_id == locus_id).all()

        peaks = []

        for a in annotations:
            if a.annotated_peaks:
                peaks += a.annotated_peaks

        if peaks:
            assert isinstance(locus_parameters, BinEstimatorLocusParams)
            locus_bin_set = LocusBinSet.from_peaks(locus_id=locus_id, peaks=peaks,
                                                   min_peak_frequency=locus_parameters.min_peak_frequency,
                                                   bin_buffer=locus_parameters.default_bin_buffer)
            self.locus_bin_sets.append(locus_bin_set)
        self.parameters_changed(locus_id)
        return self

    def calculate_locus_bin_sets(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.calculate_locus_bin_set(locus.id)
        return self

    def delete_locus_bin_set(self, locus_id):
        LocusBinSet.query.filter(LocusBinSet.project_id == self.id).filter(LocusBinSet.locus_id == locus_id).delete()
        # old_sets = [x for x in self.locus_bin_sets if x.locus_id == locus_id]
        # for s in old_sets:
        #     db.session.delete(s)
        # db.session.flush()
        self.parameters_changed(locus_id)

        return self

    def create_locus_bin_set(self, locus_id):
        lbs = LocusBinSet()
        lbs.locus_id = locus_id
        self.locus_bin_sets.append(lbs)
        db.session.flush()

    def annotate_bins(self, locus_id, peaks):
        lbs = self.get_locus_bin_set(locus_id)
        if peaks and lbs:
            peaks = lbs.annotate_bins(peaks)
        return peaks

    def get_locus_bin_set(self, locus_id):
        lbs = next((locus_bin_set for locus_bin_set in self.locus_bin_sets if locus_bin_set.locus_id == locus_id), None)
        return lbs

    def analyze_locus(self, locus_id):
        super(BinEstimatorProject, self).analyze_locus(locus_id)
        locus_params = self.get_locus_parameters(locus_id)
        if locus_params.bin_estimator_parameters_stale:
            self.calculate_locus_bin_set(locus_id)
            locus_params.bin_estimator_parameters_stale = False
        return self

    def initialize_project(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.delete_locus_bin_set(locus.id)
            self.create_locus_bin_set(locus.id)
        self.channel_annotations.delete()
        for lp in self.locus_parameters.all():
            assert isinstance(lp, ProjectLocusParams)
            lp.scanning_parameters_stale = True
            lp.filter_parameters_stale = True
            channel_ids = [_[0] for _ in set(Channel.query.filter(Channel.locus_id == lp.locus_id).values(Channel.id))]
            self.bulk_create_channel_annotations(channel_ids)
        return self

    def serialize(self):
        res = super(BinEstimatorProject, self).serialize()
        res.update({
            'locus_parameters': {_.id: _.serialize() for _ in self.locus_parameters.all()},
            'locus_bin_sets': {}
        })
        return res

    def serialize_details(self):
        res = super(BinEstimatorProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'locus_bin_sets': {locus_bin_set.locus_id: locus_bin_set.serialize() for locus_bin_set in
                               self.locus_bin_sets}
        })
        return res

    def get_alleles_dict(self, locus_id):
        lbs = self.get_locus_bin_set(locus_id)
        if lbs:
            return {x.id: False for x in lbs.bins}
        else:
            return {}


class LocusBinSet(BinFinder.BinFinder, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"), index=True)
    locus = db.relationship('Locus', lazy='immediate')
    project_id = db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id', ondelete="CASCADE"), index=True)
    project = db.relationship('BinEstimatorProject')
    bins = db.relationship('Bin', backref=db.backref('locus_bin_set'), lazy='immediate',
                           cascade='save-update, merge, delete, expunge, delete-orphan')

    @classmethod
    def copy_locus_bin_set(cls, lbs):
        bins = map(Bin.copy_bin, lbs.bins)

        db.session.expunge(lbs)
        make_transient(lbs)

        lbs.id = None
        lbs.bins = bins

        return lbs

    def __repr__(self):
        return "<Locus Bin Set: {}>".format(self.locus.label)

    @classmethod
    def from_peaks(cls, locus_id, peaks, min_peak_frequency, bin_buffer):
        locus = Locus.query.get(locus_id)
        locus_bin_set = cls()
        locus_bin_set.locus = locus
        db.session.add(locus_bin_set)

        bin_set = BinFinder.BinFinder.calculate_bins(peaks=peaks,
                                                     nucleotide_repeat_length=locus.nucleotide_repeat_length,
                                                     min_peak_frequency=min_peak_frequency, bin_buffer=bin_buffer)
        for b in bin_set.bins:
            assert isinstance(b, BinFinder.Bin)
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


class Bin(Flaggable, BinFinder.Bin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_bin_set_id = db.Column(db.Integer, db.ForeignKey('locus_bin_set.id', ondelete="CASCADE"), index=True)
    label = db.Column(db.Text, nullable=False)
    base_size = db.Column(db.Float, nullable=False)
    bin_buffer = db.Column(db.Float, nullable=False)
    peak_count = db.Column(db.Integer)

    @classmethod
    def copy_bin(cls, b):
        db.session.expunge(b)
        make_transient(b)
        b.id = None
        return b

    def __repr__(self):
        return "<Bin {}>".format(self.label)

    @reconstructor
    def init_on_load(self):
        super(Bin, self).__init__(self.label, self.base_size, self.bin_buffer, self.peak_count)

    def serialize(self):
        res = {
            'id': self.id,
            'locus_bin_set_id': self.locus_bin_set_id,
            'label': self.label,
            'base_size': self.base_size,
            'bin_buffer': self.bin_buffer,
            'peak_count': self.peak_count
        }
        return res


class ArtifactEstimatorProject(Project, BinEstimating):
    id = db.Column(db.Integer, db.ForeignKey('project.id'), primary_key=True)
    locus_artifact_estimators = db.relationship('LocusArtifactEstimator', lazy='immediate',
                                                cascade='save-update, merge, delete, delete-orphan')

    locus_parameters = db.relationship('ArtifactEstimatorLocusParams', lazy='dynamic',
                                       backref=db.backref('artifact_estimator_project'),
                                       cascade='save-update, merge, delete, delete-orphan')

    __mapper_args__ = {'polymorphic_identity': 'artifact_estimator_project'}

    @classmethod
    def copy_project(cls, project):
        assert isinstance(project, cls)
        locus_artifact_estimators = project.locus_artifact_estimators
        locus_artifact_estimators = map(LocusArtifactEstimator.copy_locus_artifact_estimator, locus_artifact_estimators)

        project = super(ArtifactEstimatorProject, cls).copy_project(project)

        project.locus_artifact_estimators = locus_artifact_estimators
        db.session.flush()

        return project

    def bin_estimator_changed(self, locus_id):
        self.clear_bin_annotations(locus_id)
        self.delete_locus_artifact_estimator(locus_id)
        lp = self.get_locus_parameters(locus_id)
        lp.set_filter_parameters_stale()
        return self

    def parameters_changed(self, locus_id):
        projects = GenotypingProject.query.filter(GenotypingProject.artifact_estimator_id == self.id).all()
        for project in projects:
            assert isinstance(project, GenotypingProject)
            project.artifact_estimator_changed(locus_id)

    def filter_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def scanning_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def artifact_estimator_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def clear_bin_annotations(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        super(ArtifactEstimatorProject, self).clear_bin_annotations(channel_annotations)
        return self

    def add_channel(self, channel_id):
        channel_annotation = super(ArtifactEstimatorProject, self).add_channel(channel_id)
        assert isinstance(self.bin_estimator, BinEstimatorProject)
        self.bin_estimator.annotate_bins(channel_annotation.channel.locus_id, channel_annotation.annotated_peaks)
        return channel_annotation

    def add_channels(self, channel_ids):
        channel_annotations = []

        for channel_id in channel_ids:
            channel_annotation = self.add_channel(channel_id)
            channel_annotations.append(channel_annotation)

        return channel_annotations

    def annotate_channel(self, channel_annotation):
        if channel_annotation.annotated_peaks:
            if self.bin_estimator:
                channel_annotation.annotated_peaks = self.bin_estimator.annotate_bins(
                    channel_annotation.channel.locus_id, channel_annotation.annotated_peaks)

    def recalculate_channel(self, channel_annotation, rescan_peaks):
        channel_annotation = super(ArtifactEstimatorProject, self).recalculate_channel(channel_annotation,
                                                                                       rescan_peaks)
        self.annotate_channel(channel_annotation)

        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks):
        recalculated_channel_annotations = super(ArtifactEstimatorProject, self).recalculate_channels(
            channel_annotations, rescan_peaks)

        for channel_annotation in recalculated_channel_annotations:
            self.annotate_channel(channel_annotation)

        return recalculated_channel_annotations

    def delete_locus_artifact_estimator(self, locus_id):
        LocusArtifactEstimator.query.filter(LocusArtifactEstimator.project_id == self.id).filter(
            LocusArtifactEstimator.locus_id == locus_id).delete()
        self.parameters_changed(locus_id)
        return ArtifactEstimatorProject.query.get(self.id)

    def calculate_locus_artifact_estimator(self, locus_id):
        self.delete_locus_artifact_estimator(locus_id)
        self.parameters_changed(locus_id)
        annotations = []
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        locus_parameters = self.get_locus_parameters(locus_id)
        assert isinstance(locus_parameters, ArtifactEstimatorLocusParams)
        max_relative_peak_height = locus_parameters.max_secondary_relative_peak_height

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

        if annotations:
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

    def annotate_artifact(self, locus_id, annotated_peaks):
        if annotated_peaks:
            for peak in annotated_peaks:
                peak['artifact_contribution'] = 0
                peak['artifact_error'] = 0
            artifact_annotator = [locus_artifact_estimator for locus_artifact_estimator in
                                  self.locus_artifact_estimators if
                                  locus_artifact_estimator.locus_id == locus_id]
            if artifact_annotator:
                artifact_annotator = artifact_annotator[0]
                assert isinstance(artifact_annotator, LocusArtifactEstimator)
                annotated_peaks = artifact_annotator.annotate_artifact(annotated_peaks)
        return annotated_peaks

    def analyze_locus(self, locus_id):
        super(ArtifactEstimatorProject, self).analyze_locus(locus_id)
        locus_parameters = self.get_locus_parameters(locus_id)
        if locus_parameters.artifact_estimator_parameters_stale:
            self.calculate_locus_artifact_estimator(locus_id)
            self.parameters_changed(locus_id)
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
            channel_ids = [_[0] for _ in set(Channel.query.filter(Channel.locus_id == lp.locus_id).values(Channel.id))]
            self.bulk_create_channel_annotations(channel_ids)
        return self

    def set_samples(self, sample_ids):
        deleted_sample_ids = set([_.id for _ in self.associated_samples]) - set(sample_ids)
        sample_ids = set(sample_ids) - set([_.id for _ in self.associated_samples])

        if deleted_sample_ids:
            to_delete = ProjectChannelAnnotations.query.join(Channel).filter(
                Channel.sample_id.in_(deleted_sample_ids)).all()
            map(db.session.delete, to_delete)

        if sample_ids:
            channel_ids = [_[0] for _ in
                           set(Channel.query.filter(Channel.sample_id.in_(sample_ids)).values(Channel.id))]
            self.bulk_create_channel_annotations(channel_ids)

        if sample_ids or deleted_sample_ids:
            for lp in self.locus_parameters.all():
                lp.scanning_parameters_stale = True
                lp.filter_parameters_stale = True

        return self

    def serialize(self):
        res = super(ArtifactEstimatorProject, self).serialize()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'bin_estimator_id': self.bin_estimator_id,
            'locus_artifact_estimators': {}
        })
        return res

    def serialize_details(self):
        res = super(ArtifactEstimatorProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'bin_estimator_id': self.bin_estimator_id,
            'locus_artifact_estimators': {locus_artifact_estimator.locus_id: locus_artifact_estimator.serialize() for
                                          locus_artifact_estimator in self.locus_artifact_estimators}
        })
        return res


class LocusArtifactEstimator(AE.ArtifactEstimatorSet, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"), index=True)
    locus = db.relationship('Locus')
    project_id = db.Column(db.Integer, db.ForeignKey('artifact_estimator_project.id', ondelete="CASCADE"), index=True)
    project = db.relationship('ArtifactEstimatorProject')
    artifact_estimators = db.relationship('ArtifactEstimator', lazy='immediate',
                                          cascade='save-update, merge, delete, delete-orphan')

    @classmethod
    def copy_locus_artifact_estimator(cls, lae):
        assert isinstance(lae, cls)
        artifact_estimators = map(ArtifactEstimator.copy_artifact_estimator, lae.artifact_estimators)

        db.session.expunge(lae)
        make_transient(lae)

        lae.id = None
        lae.artifact_estimators = artifact_estimators

        return lae

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
                                                   peak_data=estimator.peak_data, label=estimator.label)
            print artifact_estimator.label
            for eqn in estimator.artifact_equations:
                eventlet.sleep()
                assert isinstance(eqn, AE.ArtifactEquation)
                artifact_equation = ArtifactEquation(sd=eqn.sd, r_squared=eqn.r_squared, slope=eqn.slope,
                                                     intercept=eqn.intercept, start_size=eqn.start_size,
                                                     end_size=eqn.end_size, method=eqn.method)
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
    label = db.Column(db.String(255))
    artifact_distance = db.Column(db.Float, nullable=True)
    artifact_distance_buffer = db.Column(db.Float, nullable=True)
    locus_artifact_estimator_id = db.Column(db.Integer,
                                            db.ForeignKey('locus_artifact_estimator.id', ondelete="CASCADE"),
                                            index=True)
    locus_artifact_estimator = db.relationship('LocusArtifactEstimator')
    artifact_equations = db.relationship('ArtifactEquation', lazy='immediate',
                                         cascade='save-update, merge, delete, delete-orphan')
    peak_data = db.Column(MutableList.as_mutable(JSONEncodedData))

    @classmethod
    def copy_artifact_estimator(cls, ae):
        assert isinstance(ae, cls)
        art_eqs = map(ArtifactEquation.copy_artifact_equation, ae.artifact_equations)

        db.session.expunge(ae)
        make_transient(ae)

        ae.id = None
        ae.artifact_equations = art_eqs

        return ae

    @reconstructor
    def init_on_load(self):
        super(ArtifactEstimator, self).__init__(self.artifact_distance, self.artifact_distance_buffer, self.peak_data,
                                                self.artifact_equations, self.label)

    def generate_estimating_equations(self, parameter_sets):
        for eq in self.artifact_equations:
            db.session.delete(eq)
        self.artifact_equations = []
        artifact_equations = super(ArtifactEstimator, self).generate_estimating_equations(parameter_sets)
        for ae in artifact_equations:
            self.artifact_equations.append(
                ArtifactEquation(sd=ae.sd, r_squared=ae.r_squared, slope=ae.slope, intercept=ae.intercept,
                                 start_size=ae.start_size, end_size=ae.end_size, method=ae.method))

        self.locus_artifact_estimator.project.parameters_changed(self.locus_artifact_estimator.locus_id)
        return self

    def add_breakpoint(self, breakpoint):
        """
        :type breakpoint: float
        """
        old_param_sets = [{
                              'start_size': eq.start_size,
                              'end_size': eq.end_size,
                              'method': eq.method
                          } for eq in self.artifact_equations]
        if any([breakpoint > _['peak_size'] for _ in self.peak_data]):
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
            'label': self.label,
            'artifact_distance': self.artifact_distance,
            'artifact_distance_buffer': self.artifact_distance_buffer,
            'locus_artifact_estimator_id': self.locus_artifact_estimator_id,
            'peak_data': self.peak_data,
            'artifact_equations': sorted([eqn.serialize() for eqn in self.artifact_equations],
                                         key=lambda x: x['start_size'])
        }
        return res


class ArtifactEquation(Flaggable, AE.ArtifactEquation, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    artifact_estimator_id = db.Column(db.Integer, db.ForeignKey('artifact_estimator.id', ondelete="CASCADE"),
                                      index=True)
    sd = db.Column(db.Float, nullable=False)
    r_squared = db.Column(db.Float, nullable=True)
    slope = db.Column(db.Float, nullable=False)
    intercept = db.Column(db.Float, nullable=False)
    start_size = db.Column(db.Float, nullable=False)
    end_size = db.Column(db.Float, nullable=False)
    method = db.Column(db.String(255), default='TSR', nullable=False)

    @classmethod
    def copy_artifact_equation(cls, ae):
        db.session.expunge(ae)
        make_transient(ae)
        ae.id = None
        return ae

    def __repr__(self):
        return "<Artifact Equation y = {}x + {} ({})".format(self.slope, self.intercept, self.method)

    @reconstructor
    def init_on_load(self):
        super(ArtifactEquation, self).__init__(self.sd, self.r_squared, self.slope, self.intercept, self.start_size,
                                               self.end_size, self.method)

    def serialize(self):
        res = {
            'id': self.id,
            'artifact_estimator_id': self.artifact_estimator_id,
            'sd': self.sd,
            'r_squared': self.r_squared,
            'slope': self.slope,
            'intercept': self.intercept,
            'start_size': self.start_size,
            'end_size': self.end_size,
            'method': self.method
        }
        return res


class BadProportions(Exception):
    pass


class QuantificationBiasEstimatorProject(SampleBasedProject):
    id = db.Column(db.Integer, db.ForeignKey('sample_based_project.id'), primary_key=True)
    locus_parameters = db.relationship('QuantificationBiasLocusParams',
                                       backref=db.backref('quantification_bias_estimator_project'),
                                       lazy='dynamic', cascade='save-update, merge, delete, delete-orphan')

    __mapper_args__ = {'polymorphic_identity': 'quantification_bias_estimator_project'}

    def filter_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def scanning_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def parameters_changed(self, locus_id):
        projects = GenotypingProject.query.filter(GenotypingProject.bin_estimator_id == self.id).all()
        for project in projects:
            assert isinstance(project, GenotypingProject)
            project.quantification_bias_estimator_changed(locus_id)

    def annotate_quantification_bias(self, locus_id, peak_set):
        peak_set = correct_peak_proportion(self.get_beta(locus_id), peak_set)
        return peak_set

    def assign_controls(self, sample_annotation_id, controls):
        """
        :type sample_annotation_id: int
        :type controls: list[(int, float)]
        :return:
        """
        sample_annotation = ProjectSampleAnnotations.query.get(sample_annotation_id)
        assert isinstance(sample_annotation, ProjectSampleAnnotations)
        if sample_annotation.project_id != self.id:
            raise BadProportions("Sample is not a member of this project.")

        if abs(sum([_[1] for _ in controls]) - 1) > .00001:
            raise BadProportions("Sum of control proportions does not add to 1.")

        temp = []
        for control in controls:
            c = Control.query.get(control[0])
            if c.bin_estimator_id != self.bin_estimator_id:
                raise BadProportions("Control Bin Estimator Does Not Match Project Bin Estimator")
            temp += [(c, control[1])]
        controls = temp

        ControlSampleAssociation.query.filter(
            ControlSampleAssociation.sample_annotation_id == sample_annotation_id).delete()

        for control in controls:
            c, prop = control
            new_control_association = ControlSampleAssociation(control_id=c.id,
                                                               sample_annotation_id=sample_annotation_id,
                                                               proportion=prop)
            db.session.add(new_control_association)

        return self

    def get_beta(self, locus_id):
        return self.get_locus_parameters(locus_id).beta

    def calculate_beta(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        assert isinstance(lp, QuantificationBiasLocusParams)
        if lp:
            locus_annotations = self.get_locus_sample_annotations(locus_id)
            peak_sets = [filter(lambda _: _['true_proportion'] > lp.min_bias_quantifier_peak_proportion and
                                          _['peak_height'] > lp.min_bias_quantifier_peak_height,
                                locus_annotation.annotated_peaks) for locus_annotation in locus_annotations]
            peak_sets = [_ for _ in peak_sets if len(_) == 2 and sum([peak['true_proportion'] for peak in _]) == 1]
            if peak_sets and all(map(lambda _: len(_) == 2, peak_sets)):  # Algorithm currently only supports 2 peaks
                lp.beta, lp.sd, lp.r_squared = calculate_beta(peak_sets)
            else:
                lp.beta = None
        return self

    def update_true_proportion(self, locus_annotation_id, peaks):
        locus_annotation = SampleLocusAnnotation.query.filter(SampleLocusAnnotation.id == locus_annotation_id,
                                                              SampleLocusAnnotation.project_id == self.id).first()
        if locus_annotation:
            while peaks:
                updated_peak = peaks.pop()
                for peak in locus_annotation.annotated_peaks:
                    if peak['index'] == updated_peak['index']:
                        peak.update(updated_peak)
        locus_annotation.annotated_peaks.changed()
        return self

    def analyze_locus(self, locus_id):
        locus_params = self.get_locus_parameters(locus_id)
        assert isinstance(locus_params, QuantificationBiasLocusParams)
        if locus_params.scanning_parameters_stale or locus_params.filter_parameters_stale:
            locus_params.quantification_bias_parameters_stale = True

        super(SampleBasedProject, self).analyze_locus(locus_id)

        if locus_params.quantification_bias_parameters_stale:
            self.analyze_samples(locus_id)
            locus_params.quantification_bias_parameters_stale = False

        self.calculate_beta(locus_id)
        return self

    def analyze_samples(self, locus_id):
        self.clear_sample_annotations(locus_id)
        locus_params = self.get_locus_parameters(locus_id)
        assert isinstance(locus_params, QuantificationBiasLocusParams)
        locus_annotations = self.get_locus_sample_annotations(locus_id)
        all_runs = self.get_runs(locus_id)
        for locus_annotation in locus_annotations:
            eventlet.sleep()
            try:
                locus_annotation.alleles.pop('None')
            except KeyError:
                pass

            assert isinstance(locus_annotation, SampleLocusAnnotation)

            runs = all_runs.get(locus_annotation.sample_annotation.sample_id, [])

            if runs:
                channel_annotation = self.select_best_run(all_runs[locus_annotation.sample_annotation.sample_id],
                                                          locus_params.offscale_threshold)
            else:
                channel_annotation = None

            if channel_annotation:
                locus_annotation.reference_run = channel_annotation
                peaks = channel_annotation.annotated_peaks[:]
                map(lambda _: _.update({'true_proportion': 0}), peaks)

                controls_and_props = ControlSampleAssociation.query.filter(
                    ControlSampleAssociation.sample_annotation_id == locus_annotation.sample_annotations_id).values(
                    ControlSampleAssociation.control_id, ControlSampleAssociation.proportion)

                for control_id, proportion in controls_and_props:
                    control = Control.query.get(control_id)
                    assert isinstance(control, Control)
                    bin_id = str(control.alleles[str(locus_annotation.locus_id)])
                    true_peaks = [_ for _ in peaks if str(_['bin_id']) == bin_id]
                    if true_peaks:
                        true_peak = max(true_peaks, key=lambda _: _.get('peak_height'))
                        true_peak['true_proportion'] += proportion
                    locus_annotation.alleles[bin_id] = True

                locus_annotation.annotated_peaks = peaks
            else:
                locus_annotation.reference_run = None
                locus_annotation.annotated_peaks = []
                locus_annotation.alleles = dict.fromkeys(self.bin_estimator.get_alleles_dict(locus_id), False)
                locus_annotation.set_flag('manual_curation', False)
        return self

    def serialize(self):
        res = super(QuantificationBiasEstimatorProject, self).serialize()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
        })
        return res

    def serialize_details(self):
        print "Serializing QBE"
        print self.locus_parameters.all()
        res = super(QuantificationBiasEstimatorProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'sample_annotations': {x.id: x.serialize() for x in self.sample_annotations.all()}
        })
        return res


class GenotypingProject(SampleBasedProject, ArtifactEstimating, QuantificationBiasEstimating):
    # Collection of methods to annotate peaks with artifact, bin in which a peak falls, probabilistic estimate of peak
    id = db.Column(db.Integer, db.ForeignKey('sample_based_project.id'), primary_key=True)
    locus_parameters = db.relationship('GenotypingLocusParams', backref=db.backref('genotyping_project'),
                                       lazy='dynamic')

    # probability_threshold = db.Column(db.Float, default=.5, nullable=False)

    __mapper_args__ = {'polymorphic_identity': 'genotyping_project'}

    def __init__(self, locus_set_id, bin_estimator_id, **kwargs):
        super(GenotypingProject, self).__init__(locus_set_id, **kwargs)
        self.bin_estimator_id = bin_estimator_id
        self.artifact_estimator_id = kwargs.get('artifact_estimator_id', None)

    def filter_parameters_set_stale(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        self.clear_sample_annotations(locus_id)
        for c in channel_annotations:
            assert isinstance(c, ProjectChannelAnnotations)
            c.annotated_peaks = []
            c.clear_flags()
        return self

    def scanning_parameters_set_stale(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        for c in channel_annotations:
            assert isinstance(c, ProjectChannelAnnotations)
            c.peak_indices = []
        return self

    def clear_locus_artifact_annotations(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        self.clear_artifact_annotations(channel_annotations)
        self.clear_sample_annotations(locus_id)
        return self

    def clear_locus_quantification_bias_annotations(self, locus_id):
        locus_annotations = self.get_locus_sample_annotations(locus_id)
        self.clear_quantification_bias_annotations(locus_annotations)
        return self

    def change_artifact_estimator(self, artifact_estimator_id):
        if artifact_estimator_id:
            artifact_estimator = ArtifactEstimatorProject.query.get(artifact_estimator_id)
            assert isinstance(artifact_estimator, ArtifactEstimatorProject)
            if artifact_estimator.locus_set_id != self.locus_set_id:
                raise AttributeError("Artifact Estimator Locus Set does not match.")
            if artifact_estimator.bin_estimator_id != self.bin_estimator_id:
                raise AttributeError("Artifact Estimator Bin Set does not match.")
            self.artifact_estimator_id = artifact_estimator_id
        else:
            self.artifact_estimator_id = None
        db.session.flush()
        lps = self.locus_parameters.all()
        map(lambda _: _.set_filter_parameters_stale, lps)
        map(lambda _: self.clear_locus_artifact_annotations(_.locus_id), lps)
        return self

    def remove_artifact_estimator(self):
        self.artifact_estimator_id = None
        lps = self.locus_parameters.all()
        map(lambda _: self.clear_locus_artifact_annotations(_.locus_id), lps)
        db.session.flush()
        return self

    def artifact_estimator_changed(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        lp.set_filter_parameters_stale()
        self.clear_locus_artifact_annotations(locus_id)
        self.initialize_alleles(locus_id)
        return self

    def quantification_bias_estimator_changed(self, locus_id):
        self.clear_locus_quantification_bias_annotations(locus_id)
        locus_annotations = self.get_locus_sample_annotations(locus_id)
        for locus_annotation in locus_annotations:
            self.recalculate_alleles(locus_annotation)
        return self

    def annotate_channel(self, channel_annotation):
        assert isinstance(channel_annotation, ProjectChannelAnnotations)
        super(GenotypingProject, self).annotate_channel(channel_annotation)

        if channel_annotation.annotated_peaks:
            if self.bin_estimator:
                for peak in channel_annotation.annotated_peaks:
                    peak['in_bin'] = False
                    peak['bin'] = ""
                    peak['bin_id'] = None
                channel_annotation.annotated_peaks = self.bin_estimator.annotate_bins(
                    channel_annotation.channel.locus_id,
                    channel_annotation.annotated_peaks)

            if self.artifact_estimator:
                for peak in channel_annotation.annotated_peaks:
                    peak['artifact_contribution'] = 0
                    peak['artifact_error'] = 0
                channel_annotation.annotated_peaks = self.artifact_estimator.annotate_artifact(
                    channel_annotation.channel.locus_id,
                    channel_annotation.annotated_peaks)
            channel_annotation.annotated_peaks.changed()

    def add_channel(self, channel_id):
        channel_annotation = ProjectChannelAnnotations.query.filter(
            ProjectChannelAnnotations.channel_id == channel_id).filter(
            ProjectChannelAnnotations.project_id == self.id).first()

        if not channel_annotation:
            channel_annotation = super(GenotypingProject, self).add_channel(channel_id)

        return channel_annotation

    def analyze_locus(self, locus_id):
        ProjectSampleAnnotations.query.filter(ProjectSampleAnnotations.project_id == self.id).update({'moi': None})
        db.session.flush()
        locus_params = self.get_locus_parameters(locus_id)
        if locus_params.scanning_parameters_stale or locus_params.filter_parameters_stale:
            locus_params.genotyping_parameters_stale = True

        super(SampleBasedProject, self).analyze_locus(locus_id)

        if locus_params.genotyping_parameters_stale:
            self.analyze_samples(locus_id)
            locus_params.genotyping_parameters_stale = False
        return self

    def analyze_samples(self, locus_id):
        self.clear_sample_annotations(locus_id)
        self.initialize_alleles(locus_id)
        locus_params = self.get_locus_parameters(locus_id)
        assert isinstance(locus_params, GenotypingLocusParams)
        locus_annotations = self.get_locus_sample_annotations(locus_id)
        all_runs = self.get_runs(locus_id)
        for locus_annotation in locus_annotations:
            eventlet.sleep()
            try:
                locus_annotation.alleles.pop('None')
                locus_annotation.alleles.changed()
            except KeyError:
                pass

            locus_annotation.set_flag('manual_curation', False)

            assert isinstance(locus_annotation, SampleLocusAnnotation)

            runs = all_runs.get(locus_annotation.sample_annotation.sample_id, [])

            if runs:
                channel_annotation = self.select_best_run(all_runs[locus_annotation.sample_annotation.sample_id],
                                                          locus_params.offscale_threshold)
            else:
                channel_annotation = None

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

                if not locus_annotation.get_flag('failure'):
                    for peak in locus_annotation.annotated_peaks:
                        if peak['bin_id'] == 'None':
                            peak['bin_id'] = None
                            peak['bin'] = None
                            peak['in_bin'] = False
                        if not any(peak['flags'].values()) and peak['bin_id'] and peak['bin_id'] != 'None':
                            locus_annotation.alleles[str(peak['bin_id'])] = True
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

        adjusted_peak_height = peak['peak_height'] - peak.get('artifact_contribution', 0) - (
            peak.get('artifact_error', 0) * locus_params.hard_artifact_sd_limit)

        if adjusted_peak_height < locus_params.absolute_peak_height_limit:
            peak['flags']['artifact'] = True

        if peak['bleedthrough_ratio'] > locus_params.bleedthrough_filter_limit or peak['peak_height'] * \
                peak['bleedthrough_ratio'] > locus_params.offscale_threshold:
            peak['flags']['bleedthrough'] = True

        if peak['crosstalk_ratio'] > locus_params.crosstalk_filter_limit or peak['peak_height'] * \
                peak['crosstalk_ratio'] > locus_params.offscale_threshold:
            peak['flags']['crosstalk'] = True

        return peak

    # @property
    # def probability_filter(self):
    #     return probability_filter(self.probability_threshold)

    def bootstrap_allele_frequencies(self):
        # peak_filter = compose_filters(bin_filter(in_bin=True), flags_filter(), self.probability_filter)

        peak_filters = {}
        for lp in self.locus_parameters:
            peak_filters[lp.locus.label] = compose_filters(bin_filter(in_bin=True), flags_filter(),
                                                           probability_filter(lp.bootstrap_probability_threshold))

        all_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).join(Sample).filter(
            Sample.designation == 'sample').filter(SampleLocusAnnotation.project_id == self.id).all()

        all_locus_annotations = [_ for _ in all_locus_annotations if not _.get_flag('failure')]

        locus_annotation_dict = defaultdict(list)
        for annotation in all_locus_annotations:
            locus_annotation_dict[annotation.sample_annotations_id].append(annotation)

        self.initialize_probability_annotations(all_locus_annotations)
        sample_annotations = self.sample_annotations.join(Sample).filter(Sample.designation == 'sample').all()

        alleles_changed = True
        cycles = 0
        while alleles_changed:

            cycles += 1
            print cycles
            alleles_changed = False
            allele_frequency_locus_annotations = format_locus_annotations(all_locus_annotations, peak_filters)
            allele_frequencies = calculate_allele_frequencies(allele_frequency_locus_annotations)

            for sample_annotation in sample_annotations:
                assert isinstance(sample_annotation, ProjectSampleAnnotations)
                locus_annotations = locus_annotation_dict[sample_annotation.id]

                formatted_locus_annotations = format_locus_annotations(locus_annotations, peak_filters)
                moi = calculate_moi(formatted_locus_annotations, offset=1)

                for locus_annotation in locus_annotations:
                    eventlet.sleep()
                    lp = self.get_locus_parameters(locus_annotation.locus_id)
                    assert isinstance(lp, GenotypingLocusParams)
                    if len(locus_annotation.annotated_peaks) > 0 and not locus_annotation.get_flag('failure'):
                        all_peaks = locus_annotation.annotated_peaks[:]
                        possible_peaks = peak_filters[lp.locus.label](all_peaks)
                        possible_peaks = calculate_prob_negative(possible_peaks, moi,
                                                                 allele_frequencies[locus_annotation.locus.label])
                        prob_annotated_possible_peaks = calculate_prob_pos_if_observed(possible_peaks)
                        recalculated_peak_probabilities = {p['peak_index']: p['probability'] for p in
                                                           prob_annotated_possible_peaks}

                        for peak in locus_annotation.annotated_peaks:
                            if peak['peak_index'] in recalculated_peak_probabilities:
                                peak['probability'] = recalculated_peak_probabilities[peak['peak_index']]
                                if peak['probability'] < lp.bootstrap_probability_threshold:
                                    alleles_changed = True

        self.initialize_probability_annotations(all_locus_annotations)
        return allele_frequencies

    def bootstrap_moi(self, allele_frequencies):
        # peak_filter = compose_filters(bin_filter(in_bin=True), flags_filter(), self.probability_filter)

        peak_filters = {}
        for lp in self.locus_parameters:
            peak_filters[lp.locus.label] = compose_filters(bin_filter(in_bin=True), flags_filter(),
                                                           probability_filter(lp.bootstrap_probability_threshold))

        all_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).join(Sample).filter(
            Sample.designation == 'sample').filter(SampleLocusAnnotation.project_id == self.id).all()

        all_locus_annotations = [_ for _ in all_locus_annotations if not _.get_flag('failure')]

        locus_annotation_dict = defaultdict(list)
        for annotation in all_locus_annotations:
            locus_annotation_dict[annotation.sample_annotations_id].append(annotation)

        self.initialize_probability_annotations(all_locus_annotations)
        sample_annotations = self.sample_annotations.join(Sample).filter(Sample.designation == 'sample').all()

        moi_dict = defaultdict(int)

        for sample_annotation in sample_annotations:
            assert isinstance(sample_annotation, ProjectSampleAnnotations)
            locus_annotations = locus_annotation_dict[sample_annotation.id]
            moi_changed = True
            cycles = 0
            while moi_changed:
                cycles += 1
                formatted_locus_annotations = format_locus_annotations(locus_annotations, peak_filters)
                moi = calculate_moi(formatted_locus_annotations, offset=1)

                if moi_dict[sample_annotation.id] != moi:
                    moi_changed = True
                    moi_dict[sample_annotation.id] = moi
                else:
                    break

                for locus_annotation in locus_annotations:
                    eventlet.sleep()
                    lp = self.get_locus_parameters(locus_annotation.locus_id)
                    assert isinstance(lp, GenotypingLocusParams)
                    if len(locus_annotation.annotated_peaks) > 0 and not locus_annotation.get_flag('failure'):
                        all_peaks = locus_annotation.annotated_peaks[:]
                        possible_peaks = peak_filters[lp.locus.label](all_peaks)
                        possible_peaks = calculate_prob_negative(possible_peaks, moi_dict[sample_annotation.id],
                                                                 allele_frequencies[locus_annotation.locus.label])
                        prob_annotated_possible_peaks = calculate_prob_pos_if_observed(possible_peaks)
                        recalculated_peak_probabilities = {p['peak_index']: p['probability'] for p in
                                                           prob_annotated_possible_peaks}

                        for peak in locus_annotation.annotated_peaks:
                            if peak['peak_index'] in recalculated_peak_probabilities:
                                peak['probability'] = recalculated_peak_probabilities[peak['peak_index']]
        self.initialize_probability_annotations(all_locus_annotations)

        return moi_dict

    def probabilistic_peak_annotation(self, allele_frequencies=None):

        if not allele_frequencies:
            allele_frequencies = self.bootstrap_allele_frequencies()

        moi_dict = self.bootstrap_moi(allele_frequencies)

        all_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).join(Sample).filter(
            Sample.designation == 'sample').filter(SampleLocusAnnotation.project_id == self.id).all()

        all_locus_annotations = [_ for _ in all_locus_annotations if not _.get_flag('failure')]

        locus_annotation_dict = defaultdict(list)
        for annotation in all_locus_annotations:
            locus_annotation_dict[annotation.sample_annotations_id].append(annotation)

        sample_annotations = self.sample_annotations.join(Sample).filter(Sample.designation == 'sample').all()

        for sample_annotation in sample_annotations:

            assert isinstance(sample_annotation, ProjectSampleAnnotations)
            sample_annotation.moi = moi_dict[sample_annotation.id]
            locus_annotations = locus_annotation_dict[sample_annotation.id]

            verbose = False

            for locus_annotation in locus_annotations:
                for peak in locus_annotation.annotated_peaks:
                    peak['probability'] = 1
                if len(locus_annotation.annotated_peaks) > 0 and not locus_annotation.get_flag('failure'):
                    locus_annotation.annotated_peaks = calculate_prob_negative(locus_annotation.annotated_peaks,
                                                                               sample_annotation.moi,
                                                                               allele_frequencies[
                                                                                   locus_annotation.locus.label],
                                                                               verbose)
                    locus_annotation.annotated_peaks = calculate_prob_pos_if_observed(locus_annotation.annotated_peaks,
                                                                                      verbose)
                    self.recalculate_alleles(locus_annotation)
        return self

    def recalculate_alleles(self, locus_annotation):
        locus_param = self.get_locus_parameters(locus_annotation.locus_id)
        assert isinstance(locus_param, GenotypingLocusParams)
        true_peaks = []
        locus_annotation.alleles = dict.fromkeys(locus_annotation.alleles, False)
        if locus_annotation.annotated_peaks and not locus_annotation.get_flag('failure'):
            for peak in locus_annotation.annotated_peaks:
                if not any(peak['flags'].values()):
                    if peak['probability'] >= locus_param.probability_threshold or (
                                (peak['peak_height'] - peak['artifact_contribution']) /
                                peak['artifact_error']) > locus_param.soft_artifact_sd_limit:
                        locus_annotation.alleles[str(peak['bin_id'])] = True
                        true_peaks.append(peak)
            if self.quantification_bias_estimator:
                self.quantification_bias_estimator.annotate_quantification_bias(locus_annotation.locus_id, true_peaks)
        locus_annotation.alleles.changed()
        locus_annotation.annotated_peaks.changed()
    #
    # def calculate_moi(self, locus_annotations, offset=0):
    #     """
    #     Calculate MOI by returning the largest number of alleles
    #     :param locus_annotations:
    #     :return:
    #     """
    #     peak_filter = compose_filters(bin_filter(in_bin=True), flags_filter(), self.probability_filter)
    #     peak_counts = []
    #     for locus_annotation in locus_annotations:
    #         locus_params = self.get_locus_parameters(locus_annotation.locus_id)
    #         f = compose_filters(peak_filter, artifact_filter(locus_params.absolute_peak_height_limit,
    #                                                          locus_params.hard_artifact_sd_limit))
    #
    #         # peaks =
    #         if locus_annotation.annotated_peaks and not locus_annotation.get_flag('failure'):
    #             peak_counts.append(len([x for x in locus_annotation.annotated_peaks if
    #                                     x['probability'] >= self.probability_threshold]))
    #         else:
    #             peak_counts.append(0)
    #     peak_counts.sort()
    #     # if len(peak_counts) > 2:
    #     #     moi = peak_counts[-2]
    #     # else:
    #     #     moi = 0
    #     if len(peak_counts) > 0:
    #         moi = peak_counts[-1]
    #     else:
    #         moi = 0
    #     return moi

    @staticmethod
    def initialize_probability_annotations(locus_annotations):
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
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'artifact_estimator_id': self.artifact_estimator_id,
        })
        return res

    def serialize_details(self):
        res = super(GenotypingProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'artifact_estimator_id': self.artifact_estimator_id,
            'sample_annotations': {x.id: x.serialize() for x in self.sample_annotations.all()}
        })
        return res


class ProjectLocusParams(PeakScanner, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey("locus.id", ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id", ondelete="CASCADE"), index=True)
    project = db.relationship('Project', lazy='immediate')
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

        if params_changed(target, scanning_params):
            target.set_scanning_parameters_stale()
        elif params_changed(target, filter_params):
            target.set_filter_parameters_stale()

        app.logger.debug("Filter Parameters Stale: {}".format(target.filter_parameters_stale))
        app.logger.debug("Scanning Parameters Stale: {}".format(target.scanning_parameters_stale))

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)

    def set_filter_parameters_stale(self):
        self.filter_parameters_stale = True
        self.project.filter_parameters_set_stale(self.locus_id)

    def set_scanning_parameters_stale(self):
        self.set_filter_parameters_stale()
        self.scanning_parameters_stale = True
        self.project.scanning_parameters_set_stale(self.locus_id)

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
        res.update({
            'artifact_estimator_parameters_stale': self.artifact_estimator_parameters_stale
        })
        return res

    @staticmethod
    def stale_parameters(mapper, connection, target):
        super(ArtifactEstimatorLocusParams, target).stale_parameters(mapper, connection, target)
        artifact_estimator_parameters = target.artifact_estimator_parameters.keys()

        if params_changed(target, artifact_estimator_parameters):
            target.set_artifact_estimator_parameters_stale()

        app.logger.debug("Artifact Estimator Parameters Stale: {}".format(target.artifact_estimator_parameters_stale))

    def set_filter_parameters_stale(self):
        super(ArtifactEstimatorLocusParams, self).set_filter_parameters_stale()
        self.set_artifact_estimator_parameters_stale()

    def set_artifact_estimator_parameters_stale(self):
        self.artifact_estimator_parameters_stale = True
        self.project.artifact_estimator_parameters_set_stale(self.locus_id)

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)


class GenotypingLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id'), primary_key=True)
    soft_artifact_sd_limit = db.Column(db.Float, default=6)
    hard_artifact_sd_limit = db.Column(db.Float, default=0)
    offscale_threshold = db.Column(db.Integer, default=32000, nullable=False)
    bleedthrough_filter_limit = db.Column(db.Float, default=2, nullable=False)
    crosstalk_filter_limit = db.Column(db.Float, default=2, nullable=False)
    relative_peak_height_limit = db.Column(db.Float, default=0.01, nullable=False)
    absolute_peak_height_limit = db.Column(db.Integer, default=50, nullable=False)
    failure_threshold = db.Column(db.Integer, default=500, nullable=False)

    probability_threshold = db.Column(db.Float, default=0, nullable=False)
    bootstrap_probability_threshold = db.Column(db.Float, default=0, nullable=False)

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
            'failure_threshold': self.failure_threshold,
            'probability_threshold': self.probability_threshold,
            'bootstrap_probability_threshold': self.bootstrap_probability_threshold

        }

    __mapper_args__ = {
        'polymorphic_identity': 'genotyping_locus_params',
    }

    def serialize(self):
        res = super(GenotypingLocusParams, self).serialize()
        res.update(self.genotyping_parameters)
        res.update({
            'genotyping_parameters_stale': self.genotyping_parameters_stale
        })
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
        res.update({
            'bin_estimator_parameters_stale': self.bin_estimator_parameters_stale
        })
        return res

    @staticmethod
    def stale_parameters(mapper, connection, target):
        super(BinEstimatorLocusParams, target).stale_parameters(mapper, connection, target)
        bin_estimator_parameters = target.bin_estimator_parameters.keys()

        if params_changed(target, bin_estimator_parameters):
            target.bin_estimator_parameters_stale = True

        app.logger.debug("Bin Estimator Parameters Stale: {}".format(target.bin_estimator_parameters_stale))

    def set_filter_parameters_stale(self):
        super(BinEstimatorLocusParams, self).set_filter_parameters_stale()
        self.set_bin_estimator_parameters_stale()

    def set_bin_estimator_parameters_stale(self):
        self.bin_estimator_parameters_stale = True
        self.project.bin_estimator_parameters_set_stale(self.locus_id)

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)


class QuantificationBiasLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id'), primary_key=True)
    beta = db.Column(db.Float)
    sd = db.Column(db.Float)
    r_squared = db.Column(db.Float)
    offscale_threshold = db.Column(db.Integer, default=32000, nullable=False)
    min_bias_quantifier_peak_height = db.Column(db.Integer, default=1000, nullable=False)
    min_bias_quantifier_peak_proportion = db.Column(db.Float, default=.25, nullable=False)
    quantification_bias_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)

    __mapper_args__ = {
        'polymorphic_identity': 'quantification_bias_locus_params'
    }

    @property
    def quantification_bias_parameters(self):
        return {
            'beta': self.beta
        }

    @staticmethod
    def stale_parameters(mapper, connection, target):
        super(QuantificationBiasLocusParams, target).stale_parameters(mapper, connection, target)
        quantification_bias_parameters = target.quantification_bias_parameters.keys()

        if params_changed(target, quantification_bias_parameters):
            target.quantification_bias_parameters_stale = True

        app.logger.debug(
            "Quantification Bias Parameters Stale: {}".format(target.quantification_bias_parameters_stale))

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)

    def serialize(self):
        res = super(QuantificationBiasLocusParams, self).serialize()
        res.update({
            'beta': self.beta,
            'sd': self.sd,
            'r_squared': self.r_squared,
            'offscale_threshold': self.offscale_threshold,
            'min_bias_quantifier_peak_height': self.min_bias_quantifier_peak_height,
            'min_bias_quantifier_peak_proportion': self.min_bias_quantifier_peak_proportion,
            'quantification_bias_paramters_stale': self.quantification_bias_parameters_stale
        })
        print res
        return res


class ProjectChannelAnnotations(TimeStamped, Flaggable, db.Model):
    """
    Channel level analysis in a project.
    """
    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channel.id", ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id", ondelete="CASCADE"), index=True)
    channel = db.relationship('Channel', lazy='select',
                              backref=db.backref("annotations"))
    # annotated_peaks = db.Column(MutableList.as_mutable(CompressedJSONEncodedData), default=[])
    # peak_indices = db.Column(MutableList.as_mutable(CompressedJSONEncodedData))
    annotated_peaks = db.Column(MutableList.as_mutable(JSONEncodedData), default=[])
    peak_indices = db.Column(MutableList.as_mutable(JSONEncodedData))
    __table_args__ = (db.UniqueConstraint('project_id', 'channel_id', name='_project_channel_uc'),)

    def reinitialize(self):
        self.annotated_peaks = []
        self.peak_indices = []

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


class ControlSampleAssociation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    control_id = db.Column(db.Integer, db.ForeignKey("control.id", ondelete="CASCADE"), index=True,
                           nullable=False)
    control = db.relationship('Control', lazy='immediate')
    sample_annotation_id = db.Column(db.Integer, db.ForeignKey("project_sample_annotations.id", ondelete="CASCADE"),
                                     index=True, nullable=False)
    sample_annotation = db.relationship("ProjectSampleAnnotations", lazy='immediate')
    proportion = db.Column(db.Float, nullable=False)

    def __repr__(self):
        return "<ControlSampleAssociation {} at {} Relative Proportion>".format(self.control.barcode, self.proportion)


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
    assigned_controls = db.relationship('ControlSampleAssociation', lazy='select')
    moi = db.Column(db.Integer)

    __table_args__ = (db.UniqueConstraint('project_id', 'sample_id', name='_project_sample_uc'),)

    @classmethod
    def copy_project_sample_annotations(cls, psa):
        locus_annotations = map(SampleLocusAnnotation.copy_sample_locus_annotation, psa.locus_annotations)
        db.session.expunge(psa)
        make_transient(psa)
        psa.id = None

        psa.locus_annotations = locus_annotations
        return psa

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
    project_id = db.Column(db.Integer, db.ForeignKey("project.id", ondelete="CASCADE"), index=True)
    sample_annotations_id = db.Column(db.Integer, db.ForeignKey("project_sample_annotations.id", ondelete="CASCADE"),
                                      index=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"), index=True)
    locus = db.relationship('Locus', lazy='immediate')
    annotated_peaks = db.Column(MutableList.as_mutable(JSONEncodedData), default=[])
    reference_run_id = db.Column(db.Integer, db.ForeignKey('project_channel_annotations.id', ondelete="SET NULL"),
                                 index=True)
    reference_run = db.relationship('ProjectChannelAnnotations', lazy='select')
    alleles = db.Column(MutableDict.as_mutable(JSONEncodedData))

    @classmethod
    def copy_sample_locus_annotation(cls, annotation):
        db.session.expunge(annotation)
        make_transient(annotation)
        annotation.id = None
        return annotation

    def __init__(self, locus_id, project_id):
        self.locus_id = locus_id
        self.project_id = project_id

    def __repr__(self):
        return "<SampleLocusAnnotation {}>".format(self.locus.label)

    def clear_annotated_peaks(self):
        self.annotated_peaks = []

    def clear_alleles(self):
        self.alleles = dict.fromkeys(self.alleles, False)

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

        if self.reference_run_id:
            res.update({
                'reference_channel_id': self.reference_run.channel_id
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
            'locus_metadata': self.locus_metadata,
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
    max_peak_height = db.Column(db.Integer, default=24000, nullable=False)
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
            'unusable_sq_limit': self.unusable_sq_limit,
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
    label = db.Column(db.String(255), nullable=False, index=True)
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
    def from_zip(cls, zip_file, ladder, creator=None, comments=None, add_to_db=True):
        extracted_plate = PlateExtractor.from_zip(zip_file, creator, comments)

        if type(ladder) == int:
            ladder = Ladder.query.get(ladder)

        extracted_plate = extracted_plate.calculate_base_sizes(ladder=ladder.base_sizes, color=ladder.color,
                                                               base_size_precision=ladder.base_size_precision,
                                                               sq_limit=ladder.sq_limit,
                                                               filter_parameters=ladder.filter_parameters,
                                                               scanning_parameters=ladder.scanning_parameters)

        p = cls(label=extracted_plate.label, comments=extracted_plate.comments, creator=extracted_plate.creator,
                date_run=extracted_plate.date_run, well_arrangement=extracted_plate.well_arrangement,
                ce_machine=extracted_plate.ce_machine, plate_hash=extracted_plate.plate_hash)

        if add_to_db:
            db.session.add(p)

        for well in extracted_plate.wells:
            w = Well(well_label=well.well_label, comments=well.comments, base_sizes=well.base_sizes,
                     ladder_peak_indices=well.ladder_peak_indices, sizing_quality=well.sizing_quality,
                     offscale_indices=well.offscale_indices, fsa_hash=well.fsa_hash)

            w.plate = p
            w.ladder = ladder

            if add_to_db:
                db.session.add(w)

            for channel in well.channels:
                c = Channel(wavelength=channel.wavelength, data=channel.data, color=channel.color)
                c.well = w
                if add_to_db:
                    db.session.add(c)
        return p

    @classmethod
    def from_zips(cls, zip_files, ladder_id, creator=None, comments=None):
        plate_ids = []
        for z in zip_files:
            plate_ids.append(cls.from_zip(z, ladder_id, creator, comments))
        return plate_ids

    def load_plate_map(self, plate_map_file):
        r = csv.DictReader(plate_map_file)
        locus_labels = r.fieldnames
        locus_labels = [x for x in locus_labels if x.lower() not in ['', 'well']]
        for entry in r:
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
    plate_id = db.Column(db.Integer, db.ForeignKey("plate.id", ondelete="CASCADE"), nullable=False, index=True)
    well_label = db.Column(db.String(3), nullable=False)
    # base_sizes = deferred(db.Column(MutableList.as_mutable(JSONEncodedData)))
    # Compressed implementation
    base_sizes = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))
    ladder_peak_indices = db.Column(MutableList.as_mutable(JSONEncodedData))
    sizing_quality = db.Column(db.Float, default=1000)
    channels = db.relationship('Channel', backref=db.backref('well'),
                               cascade='save-update, merge, delete, delete-orphan')
    offscale_indices = db.Column(MutableList.as_mutable(JSONEncodedData))
    ladder_id = db.Column(db.Integer, db.ForeignKey('ladder.id'), nullable=False, index=True)
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
    well_id = db.Column(db.Integer, db.ForeignKey("well.id", ondelete="CASCADE"), index=True)
    wavelength = db.Column(db.Integer, nullable=False)
    # data = deferred(db.Column(MutableList.as_mutable(JSONEncodedData)))
    # Compressed Implementation
    data = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))
    max_data_point = db.Column(db.Integer, default=0)

    sample_id = db.Column(db.Integer, db.ForeignKey('sample.id'), index=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id'), index=True)
    locus = db.relationship('Locus')

    def __repr__(self):
        if self.locus:
            return "<Channel {} {}>".format(self.locus.label, self.color.capitalize())
        else:
            return "<Channel {}>".format(self.color)

    @reconstructor
    def init_on_load(self):
        super(Channel, self).__init__(color=self.color, wavelength=self.wavelength)

    def reinitialize(self):
        self.max_data_point = 0
        self.sample_id = None
        self.locus_id = None

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


@event.listens_for(SignallingSession, 'before_flush')
def clear_channel_annotations(session, _, __):
    channel_annotation_ids = [_.id for _ in db.session.deleted if isinstance(_, ProjectChannelAnnotations)]
    if channel_annotation_ids:
        annotations = SampleLocusAnnotation.query.filter(
            SampleLocusAnnotation.reference_run_id.in_(channel_annotation_ids)).all()
        for a in annotations:
            assert isinstance(a, SampleLocusAnnotation)
            a.clear_annotated_peaks()
            a.clear_alleles()
            a.clear_flags()


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


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if db.engine.url.drivername == 'sqlite':
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


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
        def peak_filter(_):
            return _

    all_locus_annotations.sort(key=lambda _: _.locus.label)
    formatted_locus_annotations = []

    if isinstance(peak_filter, dict):
        for locus_annotation in all_locus_annotations:
            l = locus_annotation.locus.label
            formatted_locus_annotations.append((l, peak_filter[l](locus_annotation.annotated_peaks)))

    else:
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
    channel_annotations = channel_annotations or []
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
                max_best_peak = max(best_peaks, key=lambda _: _['peak_height'])
            else:
                max_best_peak = {'peak_height': 0}

            if curr_peaks:
                max_curr_peak = max(curr_peaks, key=lambda _: _['peak_height'])
            else:
                max_curr_peak = {'peak_height': 0}

            if max_curr_peak['peak_height'] > max_best_peak['peak_height']:
                best_annotation = annotation

    return best_annotation
