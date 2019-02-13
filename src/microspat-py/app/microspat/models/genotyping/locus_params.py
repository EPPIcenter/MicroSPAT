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
            cls.soft_artifact_sd_limit, cls.hard_artifact_sd_limit, cls.offscale_threshold,
            cls.bleedthrough_filter_limit, cls.crosstalk_filter_limit,
            cls.relative_peak_height_limit, cls.absolute_peak_height_limit, cls.failure_threshold,
            cls.probability_threshold, cls.bootstrap_probability_threshold,
            cls.genotyping_parameters_stale, cls.last_updated
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
                'soft_artifact_sd_limit': lp[23],
                'hard_artifact_sd_limit': lp[24],
                'offscale_threshold': lp[25],
                'bleedthrough_filter_limit': lp[26],
                'crosstalk_filter_limit': lp[27],
                'relative_peak_height_limit': lp[28],
                'absolute_peak_height_limit': lp[29],
                'failure_threshold': lp[30],
                'probability_threshold': lp[31],
                'bootstrap_probability_threshold': lp[32],
                'genotyping_parameters_stale': lp[33],
                'last_updated': lp[34]
            }
            res.append(r)
        return res

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
