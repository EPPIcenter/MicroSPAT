from sqlalchemy.ext.declarative import declared_attr
import eventlet

from app import db, socketio
from ..project.sample_annotations import SampleLocusAnnotation
from ..project.channel_annotations import ProjectChannelAnnotations
from ..project.sample_annotations import ProjectSampleAnnotations
from ..bin_estimator.project import BinEstimatorProject
from .bin import Bin
from .locus_bin_set import LocusBinSet


class BinEstimating(object):

    @declared_attr
    def bin_estimator_id(self):
        return db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id'), index=True)

    @declared_attr
    def bin_estimator(self):
        return db.relationship('BinEstimatorProject', lazy='select', foreign_keys=[self.bin_estimator_id])

    @property
    def locus_parameters(self):
        raise NotImplementedError()

    @property
    def locus_set_id(self):
        raise NotImplementedError()

    def get_locus_parameters(self, locus_id):
        raise NotImplementedError()

    def get_locus_channel_annotations(self, locus_id):
        raise NotImplementedError()

    def clear_sample_annotations(self, locus_id):
        raise NotImplementedError()

    def change_bin_estimator(self, bin_estimator_id):
        if bin_estimator_id:
            bin_estimator = BinEstimatorProject.query.get(bin_estimator_id)
            assert isinstance(bin_estimator, BinEstimatorProject)
            if bin_estimator.locus_set_id != self.locus_set_id:
                raise AttributeError("Artifact Estimator Locus Set does not match.")
            self.bin_estimator_id = bin_estimator_id
        else:
            self.bin_estimator_id = None
        db.session.flush()
        lps = self.locus_parameters.all()
        for lp in lps:
            self.bin_estimator_changed(lp.locus_id)
        return self

    def remove_bin_estimator(self):
        self.bin_estimator_id = None
        lps = self.locus_parameters.all()
        for lp in lps:
            self.bin_estimator_changed(lp.locus_id)
        db.session.flush()
        return self

    def clear_locus_bin_annotations(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        self.clear_bin_annotations(channel_annotations)
        self.clear_sample_annotations(locus_id)

    def bin_estimator_changed(self, locus_id):
        socketio.sleep()
        lp = self.get_locus_parameters(locus_id)
        lp.set_filter_parameters_stale()
        self.clear_locus_bin_annotations(locus_id)
        return self

    def clear_bin_annotations(self, channel_annotations):
        socketio.sleep()
        for annotation in channel_annotations:
            assert isinstance(annotation, ProjectChannelAnnotations)
            if annotation.annotated_peaks:
                for peak in annotation.annotated_peaks:
                    socketio.sleep()
                    if self.bin_estimator_id:
                        peak['in_bin'] = False
                        peak['bin'] = ""
                        peak['bin_id'] = None
                    elif 'bin' in peak:
                        peak.pop('in_bin')
                        peak.pop('bin')
                        peak.pop('bin_id')

    def annotate_bins(self, channel_annotations):
        socketio.sleep()
        if self.bin_estimator_id:
            self.clear_bin_annotations(channel_annotations)
            for annotation in channel_annotations:
                socketio.sleep()
                assert isinstance(annotation, ProjectChannelAnnotations)
                if annotation.annotated_peaks:
                    self.bin_estimator.annotate_bins(
                        annotation.channel.locus_id,
                        annotation.annotated_peaks
                    )
                annotation.annotated_peaks.changed()

    def initialize_alleles(self, locus_id):
        """
        Clear all allele calls for a given locus
        """
        from ..bin_estimator.project import BinEstimatorProject
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
