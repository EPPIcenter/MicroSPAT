from marshmallow import fields

from .schemas import BaseSchema, JSONEncodedField, Flaggable


class ProjectSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        exclude = ['discriminator']
    title = fields.String()
    date = fields.DateTime()
    creator = fields.String()
    description = fields.String()
    locus_set = fields.Integer()
    locus_parameters = fields.List(fields.Integer())
    last_updated = fields.DateTime()


class GenotypingProjectSchema(ProjectSchema):
    # locus_parameters = fields.List(fields.Integer())
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
