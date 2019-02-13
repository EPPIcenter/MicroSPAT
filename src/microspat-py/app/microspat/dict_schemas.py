from marshmallow import fields, Schema

# from .schemas import JSONEncodedField, Flaggable


class BaseSchema(Schema):
    id = fields.Integer()


class TimeStamped(Schema):
    last_updated = fields.DateTime()


class ProjectSchema(BaseSchema, TimeStamped):
    title = fields.String()
    date = fields.DateTime()
    creator = fields.String()
    description = fields.String()
    locus_set = fields.Integer()
    locus_parameters = fields.List(fields.Integer())
    last_updated = fields.DateTime()


class SampleBasedProjectSchema(ProjectSchema):
    sample_annotations = fields.List(fields.Integer())


class ProjectLocusParamsSchema(BaseSchema, TimeStamped):
    project = fields.Integer()
    locus = fields.Integer()
    locked = fields.Boolean()

    scanning_method = fields.String()
    maxima_window = fields.Integer()

    # relmax Scanning Params
    argrelmax_window = fields.Integer()
    trace_smoothing_window = fields.Integer()
    trace_smoothing_order = fields.Integer()
    tophat_factor = fields.Float()

    # CWT Scanning Params
    cwt_min_width = fields.Integer()
    cwt_max_width = fields.Integer()
    min_snr = fields.Float()
    noise_perc = fields.Float()
    gap_threshold = fields.Integer()

    min_peak_height = fields.Integer()
    max_peak_height = fields.Integer()
    min_peak_height_ratio = fields.Float()
    max_bleedthrough = fields.Float()
    max_crosstalk = fields.Float()
    min_peak_distance = fields.Float()

    scanning_parameters_stale = fields.Boolean()
    filter_parameters_stale = fields.Boolean()


class GenotypingLocusParamsSchema(ProjectLocusParamsSchema):
    soft_artifact_sd_limit = fields.Float()
    hard_artifact_sd_limit = fields.Float()
    offscale_threshold = fields.Integer()
    bleedthrough_filter_limit = fields.Float()
    crosstalk_filter_limit = fields.Float()
    relative_peak_height_limit = fields.Float()
    absolute_peak_height_limit = fields.Integer()
    failure_threshold = fields.Integer()
    probability_threshold = fields.Float()
    bootstrap_probability_threshold = fields.Float()
    genotyping_parameters_stale = fields.Boolean()


class GenotypingProjectSchema(SampleBasedProjectSchema):
    bin_estimator = fields.Integer()
    artifact_estimator = fields.Integer()
    quantification_bias_estimator = fields.Integer()


class BinEstimatorProjectSchema(ProjectSchema):
    locus_bin_sets = fields.List(fields.Integer())


class ArtifactEstimatorProjectSchema(ProjectSchema):
    locus_artifact_estimators = fields.List(fields.Integer())


class QuantificationBiasEstimatorProjectSchema(ProjectSchema):
    bin_estimator = fields.Integer()
    artifact_estimator = fields.Integer()


class LocusBinSetSchema(BaseSchema, TimeStamped):
    locus = fields.Integer()
    project = fields.Integer()
    bins = fields.List(fields.Integer())


class BinSchema(BaseSchema, TimeStamped):
    locus_bin_set = fields.Integer()
    label = fields.String()
    base_size = fields.Float()
    bin_buffer = fields.Float()
    peak_count = fields.Integer()
