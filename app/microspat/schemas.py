import json
from marshmallow import fields
from marshmallow_sqlalchemy import ModelSchema

from app.microspat.models import *
from app import db


class BaseSchema(ModelSchema):
    class Meta:
        sqla_session = db.session
    id = fields.String()


class JSONEncodedField(fields.Field):
    def _deserialize(self, value, attr, data):
        if value is not None:
            value = json.loads(value)
        return value


class Flaggable(object):
    flags = JSONEncodedField()


class SampleSchema(BaseSchema, Flaggable):
    class Meta:
        model = Sample


class ControlSchema(BaseSchema):
    class Meta:
        model = Control
    alleles = JSONEncodedField()


class ControlSampleAssociationSchema(BaseSchema):
    class Meta:
        model = ControlSampleAssociation


class ProjectSchema(BaseSchema):
    class Meta:
        exclude = ['discriminator']


class BinEstimatorProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = BinEstimatorProject


class LocusBinSetSchema(BaseSchema):
    class Meta:
        model = LocusBinSet


class BinSchema(BaseSchema, Flaggable):
    class Meta:
        model = Bin


class ArtifactEstimatorProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = ArtifactEstimatorProject


class LocusArtifactEstimatorSchema(BaseSchema):
    class Meta:
        model = LocusArtifactEstimator


class ArtifactEstimatorSchema(BaseSchema):
    class Meta:
        model = ArtifactEstimator
    peak_data = JSONEncodedField()


class ArtifactEquationSchema(BaseSchema, Flaggable):
    class Meta:
        model = ArtifactEquation


class QuantificationBiasEstimatorProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = QuantificationBiasEstimatorProject


class GenotypingProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = GenotypingProject


class LocusParamsSchema(BaseSchema):
    class Meta:
        exclude = ['discriminator']


class ArtifactEstimatorLocusParamsSchema(LocusParamsSchema):
    class Meta(LocusParamsSchema.Meta):
        model = ArtifactEstimatorLocusParams


class GenotypingLocusParamsSchema(LocusParamsSchema):
    class Meta(LocusParamsSchema.Meta):
        model = GenotypingLocusParams


class BinEstimatorLocusParamsSchema(LocusParamsSchema):
    class Meta(LocusParamsSchema.Meta):
        model = BinEstimatorLocusParams


class QuantificationBiasEstimatorLocusParamsSchema(LocusParamsSchema):
    class Meta(LocusParamsSchema.Meta):
        model = QuantificationBiasEstimatorLocusParams


class ProjectChannelAnnotationsSchema(BaseSchema, Flaggable):
    class Meta:
        model = ProjectChannelAnnotations
    annotated_peaks = JSONEncodedField()
    peak_indices = JSONEncodedField()


class ProjectSampleAnnotationsSchema(BaseSchema):
    class Meta:
        model = ProjectSampleAnnotations


class SampleLocusAnnotationSchema(BaseSchema, Flaggable):
    class Meta:
        model = SampleLocusAnnotation
    annotated_peaks = JSONEncodedField()


class GenotypeSchema(SampleLocusAnnotationSchema):
    class Meta:
        model = Genotype
    alleles = JSONEncodedField()


class LocusSetSchema(BaseSchema):
    class Meta:
        model = LocusSet


class LocusSchema(BaseSchema):
    class Meta:
        model = Locus
    locus_metadata = JSONEncodedField()


class LadderSchema(BaseSchema):
    class Meta:
        model = Ladder
    base_sizes = JSONEncodedField()


class PlateSchema(BaseSchema, Flaggable):
    class Meta:
        model = Plate
    power = JSONEncodedField()
    current = JSONEncodedField()
    voltage = JSONEncodedField()
    temperature = JSONEncodedField()


class PlateListSchema(PlateSchema):
    class Meta:
        model = Plate
    wells = fields.List(fields.Integer())


class WellSchema(BaseSchema, Flaggable):
    class Meta:
        model = Well
    base_sizes = JSONEncodedField()
    ladder_peak_indices = JSONEncodedField()
    offscale_indices = JSONEncodedField()


class WellListSchema(WellSchema):
    class Meta:
        model = Well
        # exclude = ['base_sizes']


class ChannelSchema(BaseSchema, Flaggable):
    class Meta:
        model = Channel
    data = JSONEncodedField()


class ChannelListSchema(ChannelSchema):
    class Meta:
        model = Channel
        exclude = ['data']

