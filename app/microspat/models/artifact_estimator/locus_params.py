from flask import current_app as app
from sqlalchemy import event

from app import db
from ..project.locus_params import ProjectLocusParams
from app.microspat.models.utils import params_changed


class ArtifactEstimatorLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id', ondelete="CASCADE"), primary_key=True)
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