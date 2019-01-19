from sqlalchemy.ext.declarative import declared_attr

from app import db
from app.microspat.models.sample.sample_locus_annotation import SampleLocusAnnotation
from app.microspat.models.quantification_bias_estimator.project import QuantificationBiasEstimatorProject


class QuantificationBiasEstimating(object):
    @declared_attr
    def quantification_bias_estimator_id(self):
        return db.Column(db.Integer, db.ForeignKey('quantification_bias_estimator_project.id'), index=True)

    @declared_attr
    def quantification_bias_estimator(self):
        return db.relationship('QuantificationBiasEstimatorProject', lazy='select',
                               foreign_keys=[self.quantification_bias_estimator_id])

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

    def get_locus_sample_annotations(self, locus_id):
        raise NotImplementedError()

    def change_quantification_bias_estimator(self, qbe_id):
        if qbe_id:
            qb_estimator = QuantificationBiasEstimatorProject.query.get(qbe_id)
            assert isinstance(qb_estimator, QuantificationBiasEstimatorProject)
            if qb_estimator.locus_set_id != self.locus_set_id:
                raise AttributeError("Quantification Bias Estimator Locus Set does not match.")
            self.quantification_bias_estimator_id = qbe_id
        else:
            self.quantification_bias_estimator_id = None
        lps = self.locus_parameters.all()
        for lp in lps:
            self.quantification_bias_estimator_changed(lp.locus_id)
        return self

    def remove_quantification_bias_estimator(self):
        self.quantification_bias_estimator_id = None
        lps = self.locus_parameters.all()
        for lp in lps:
            self.quantification_bias_estimator_changed(lp.locus_id)
        return self

    def quantification_bias_estimator_changed(self, locus_id):
        self.clear_locus_quantification_bias_annotations(locus_id)

    def clear_locus_quantification_bias_annotations(self, locus_id):
        locus_annotations = self.get_locus_sample_annotations(locus_id)
        self.clear_quantification_bias_annotations(locus_annotations)

    def clear_quantification_bias_annotations(self, locus_annotations):
        if self.quantification_bias_estimator_id:
            for annotation in locus_annotations:
                assert isinstance(annotation, SampleLocusAnnotation)
                if annotation.annotated_peaks:
                    for peak in annotation.annotated_peaks:
                        if self.quantification_bias_estimator_id:
                            peak['relative_quantification'] = None
                            peak['corrected_relative_quantification'] = None
                        elif 'relative_quantification' in peak:
                            peak.pop('relative_quantification')
                            peak.pop('corrected_relative_quantificiation')

    def annotate_quantification_bias(self, locus_annotations):
        self.clear_quantification_bias_annotations(locus_annotations)
        if self.quantification_bias_estimator_id:
            assert isinstance(self.quantification_bias_estimator, QuantificationBiasEstimatorProject)
            for annotation in locus_annotations:
                assert isinstance(annotation, SampleLocusAnnotation)
                if annotation.annotated_peaks:
                    self.quantification_bias_estimator.annotate_quantification_bias(
                        annotation.locus_id,
                        annotation.annotated_peaks
                    )
                    annotation.annotated_peaks.changed()
