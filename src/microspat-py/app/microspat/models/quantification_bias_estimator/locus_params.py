from sqlalchemy import event

from app import db
from app.microspat.models.project.locus_params import ProjectLocusParams
from app.microspat.models.utils import params_changed


class QuantificationBiasEstimatorLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id', ondelete="CASCADE"), primary_key=True)
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
        super(QuantificationBiasEstimatorLocusParams, target).stale_parameters(mapper, connection, target)
        quantification_bias_parameters = target.quantification_bias_parameters.keys()

        if params_changed(target, quantification_bias_parameters):
            target.quantification_bias_parameters_stale = True


    def serialize(self):
        res = super(QuantificationBiasEstimatorLocusParams, self).serialize()
        res.update({
            'beta': self.beta,
            'sd': self.sd,
            'r_squared': self.r_squared,
            'offscale_threshold': self.offscale_threshold,
            'min_bias_quantifier_peak_height': self.min_bias_quantifier_peak_height,
            'min_bias_quantifier_peak_proportion': self.min_bias_quantifier_peak_proportion,
            'quantification_bias_parameters_stale': self.quantification_bias_parameters_stale
        })
        return res

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)
