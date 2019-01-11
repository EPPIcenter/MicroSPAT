from flask import current_app as app
from sqlalchemy import event

from app import db

from app.microspat.models.project.locus_params import ProjectLocusParams
from app.microspat.models.utils import params_changed


class GenotypingLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id', ondelete="CASCADE"), primary_key=True)
    soft_artifact_sd_limit = db.Column(db.Float, default=6)
    hard_artifact_sd_limit = db.Column(db.Float, default=0)
    offscale_threshold = db.Column(db.Integer, default=32000, nullable=False)
    bleedthrough_filter_limit = db.Column(db.Float, default=2, nullable=False)
    crosstalk_filter_limit = db.Column(db.Float, default=2, nullable=False)
    relative_peak_height_limit = db.Column(db.Float, default=0.01, nullable=False)
    absolute_peak_height_limit = db.Column(db.Integer, default=300, nullable=False)
    failure_threshold = db.Column(db.Integer, default=500, nullable=False)

    probability_threshold = db.Column(db.Float, default=0.9, nullable=False)
    bootstrap_probability_threshold = db.Column(db.Float, default=0.99, nullable=False)

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
