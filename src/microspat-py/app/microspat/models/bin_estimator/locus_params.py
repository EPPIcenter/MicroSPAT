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

    @classmethod
    def get_serialized_list(cls, project_id):
        lps = cls.query.filter(cls.project_id == project_id).values(
            cls.id, cls.locus_id, cls.project_id, cls.locked,
            cls.scanning_method, cls.maxima_window, cls.argrelmax_window, cls.trace_smoothing_window,
            cls.trace_smoothing_order, cls.tophat_factor, cls.cwt_min_width, cls.cwt_max_width,
            cls.min_snr, cls.noise_perc, cls.gap_threshold,
            cls.min_peak_height,
            cls.max_peak_height, cls.min_peak_height_ratio, cls.max_bleedthrough, cls.max_crosstalk,
            cls.min_peak_distance, cls.scanning_parameters_stale, cls.filter_parameters_stale,
            cls.min_peak_frequency, cls.default_bin_buffer,
            cls.bin_estimator_parameters_stale, cls.last_updated
        )

        res = []
        for lp in lps:
            r = {
                'id': lp[0],
                'locus': lp[1],
                'project': lp[2],
                'locked': lp[3],
                'scanning_method': lp[4],
                'maxima_window': lp[5],
                'argrelmax_window': lp[6],
                'trace_smoothing_window': lp[7],
                'trace_smoothing_order': lp[8],
                'tophat_factor': lp[9],
                'cwt_min_width': lp[10],
                'cwt_max_width': lp[11],
                'min_snr': lp[12],
                'noise_perc': lp[13],
                'gap_threshold': lp[14],
                'min_peak_height': lp[15],
                'max_peak_height': lp[16],
                'min_peak_height_ratio': lp[17],
                'max_bleedthrough': lp[18],
                'max_crosstalk': lp[19],
                'min_peak_distance': lp[20],
                'scanning_parameters_stale': lp[21],
                'filter_parameters_stale': lp[22],
                'min_peak_frequency': lp[23],
                'default_bin_buffer': lp[24],
                'bin_estimator_parameters_stale': lp[25],
                'last_updated': lp[26]
            }
            res.append(r)
        return res

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
