from sqlalchemy import event

from app import db
from app.microspat.models.project.locus_params import ProjectLocusParams
from app.microspat.models.utils import params_changed


class BinEstimatorLocusParams(ProjectLocusParams):
    id = db.Column(db.Integer, db.ForeignKey('project_locus_params.id', ondelete="CASCADE"), primary_key=True)
    min_peak_frequency = db.Column(db.Integer, default=10, nullable=False)
    default_bin_buffer = db.Column(db.Float, default=.75, nullable=False)
    bin_estimator_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)

    __mapper_args__ = {
        'polymorphic_identity': 'bin_estimator_locus_params'
    }

    @property
    def bin_estimator_parameters(self):
        return {
            'min_peak_frequency': self.min_peak_frequency,
            'default_bin_buffer': self.default_bin_buffer
        }

    @staticmethod
    def stale_parameters(mapper, connection, target):
        super(BinEstimatorLocusParams, target).stale_parameters(mapper, connection, target)
        bin_estimator_parameters = target.bin_estimator_parameters.keys()

        if params_changed(target, bin_estimator_parameters):
            target.bin_estimator_parameters_stale = True

    def serialize(self):
        res = super(BinEstimatorLocusParams, self).serialize()
        res.update(self.bin_estimator_parameters)
        res.update({
            'bin_estimator_parameters_stale': self.bin_estimator_parameters_stale
        })
        return res

    def set_filter_parameters_stale(self):
        super(BinEstimatorLocusParams, self).set_filter_parameters_stale()
        self.set_bin_estimator_parameters_stale()

    def set_bin_estimator_parameters_stale(self):
        self.bin_estimator_parameters_stale = True
        self.project.bin_estimator_parameters_set_stale(self.locus_id)

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)
