from sqlalchemy.ext.declarative import declared_attr

from app import db
from app.microspat.models.artifact_estimator.project import ArtifactEstimatorProject
from app.microspat.models.project.channel_annotations import ProjectChannelAnnotations


class ArtifactEstimating(object):

    @declared_attr
    def artifact_estimator_id(self):
        return db.Column(db.Integer, db.ForeignKey('artifact_estimator_project.id'), index=True)

    @declared_attr
    def artifact_estimator(self):
        return db.relationship('ArtifactEstimatorProject', lazy='select', foreign_keys=[self.artifact_estimator_id])

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

    def change_artifact_estimator(self, artifact_estimator_id):
        if artifact_estimator_id:
            artifact_estimator = ArtifactEstimatorProject.query.get(artifact_estimator_id)
            assert isinstance(artifact_estimator, ArtifactEstimatorProject)
            if artifact_estimator.locus_set_id != self.locus_set_id:
                raise AttributeError("Artifact Estimator Locus Set does not match.")
            self.artifact_estimator_id = artifact_estimator_id
        else:
            self.artifact_estimator_id = None
        lps = self.locus_parameters.all()
        for lp in lps:
            self.artifact_estimator_changed(lp.locus_id)
        return self

    def remove_artifact_estimator(self):
        self.artifact_estimator_id = None
        lps = self.locus_parameters.all()
        for lp in lps:
            self.clear_locus_artifact_annotations(lp.locus_id)
        return self

    def clear_locus_artifact_annotations(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        self.clear_artifact_annotations(channel_annotations)
        self.clear_sample_annotations(locus_id)

    def artifact_estimator_changed(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        lp.set_filter_parameters_stale()
        self.clear_locus_artifact_annotations(locus_id)

    def clear_artifact_annotations(self, channel_annotations):
        for annotation in channel_annotations:
            assert isinstance(annotation, ProjectChannelAnnotations)
            if annotation.annotated_peaks:
                for peak in annotation.annotated_peaks:
                    if self.artifact_estimator_id:
                        peak['artifact_contribution'] = 0
                        peak['artifact_error'] = 0
                    elif 'artifact_contribution' in peak:
                        peak.pop('artifact_contribution')
                        peak.pop('artifact_error')

    def annotate_artifact(self, channel_annotations):
        if self.artifact_estimator_id:
            self.clear_artifact_annotations(channel_annotations)
            for annotation in channel_annotations:
                assert isinstance(annotation, ProjectChannelAnnotations)
                if annotation.annotated_peaks:
                    self.artifact_estimator.annotate_artifact(
                        annotation.channel.locus_id,
                        annotation.annotated_peaks
                    )
                    annotation.annotated_peaks.changed()
