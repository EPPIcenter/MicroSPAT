import ujson as json
from marshmallow import fields
from marshmallow_sqlalchemy import ModelSchema

from app import db
from app.microspat.models import *


class BaseSchema(ModelSchema):
    class Meta:
        sqla_session = db.session
        reducer_module = json

    id = fields.Integer()


class JSONEncodedField(fields.Field):
    def _deserialize(self, value, attr, data):
        if value is not None:
            value = json.loads(value)
        return value


class Flaggable(object):
    flags = JSONEncodedField()


class SampleSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = Sample


class ControlSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = Control
    alleles = JSONEncodedField()


class ControlSampleAssociationSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = ControlSampleAssociation


class DeferredControlSampleAssociationSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = ControlSampleAssociation
    control = fields.Integer()
    sample_annotation = fields.Integer()
    proportion = fields.Float()


class ProjectSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        exclude = ['discriminator']


class BinEstimatorProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = BinEstimatorProject


class LocusBinSetSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = LocusBinSet


class BinSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = Bin


class ArtifactEstimatorProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = ArtifactEstimatorProject


class LocusArtifactEstimatorSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = LocusArtifactEstimator


class ArtifactEstimatorSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = ArtifactEstimator
    peak_data = JSONEncodedField()


class ArtifactEquationSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = ArtifactEquation


class QuantificationBiasEstimatorProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = QuantificationBiasEstimatorProject


class GenotypingProjectSchema(ProjectSchema):
    class Meta(ProjectSchema.Meta):
        model = GenotypingProject


class LocusParamsSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
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
    class Meta(BaseSchema.Meta):
        model = ProjectChannelAnnotations
    annotated_peaks = JSONEncodedField()
    peak_indices = JSONEncodedField()


class DeferredProjectChannelAnnotationsSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = ProjectChannelAnnotations
    annotated_peaks = JSONEncodedField()
    peak_indices = JSONEncodedField()
    channel = fields.Integer()
    project = fields.Integer()


class ProjectSampleAnnotationsSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = ProjectSampleAnnotations


class DeferredProjectSampleAnnotationsSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = ProjectSampleAnnotations
    locus_annotations = fields.List(fields.Integer())
    sample = fields.Integer()
    project = fields.Integer()
    moi = fields.Integer()


class SampleLocusAnnotationSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = SampleLocusAnnotation
        exclude = ['discriminator']
    annotated_peaks = JSONEncodedField()
    project = fields.Integer(attribute='project_id')


class DeferredSampleLocusAnnotationSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = SampleLocusAnnotation
        exclude = ['discriminator']
    annotated_peaks = JSONEncodedField()
    project = fields.Integer()
    sample_annotations = fields.Integer()
    locus = fields.Integer()
    reference_run = fields.Integer()


class GenotypeSchema(SampleLocusAnnotationSchema):
    class Meta(SampleLocusAnnotationSchema.Meta):
        model = Genotype
    alleles = JSONEncodedField()
    annotated_peaks = JSONEncodedField()


class DeferredGenotypeSchema(DeferredSampleLocusAnnotationSchema):
    class Meta(DeferredSampleLocusAnnotationSchema.Meta):
        model = Genotype
    annotated_peaks = JSONEncodedField()
    project = fields.Integer()
    sample_annotations = fields.Integer()
    locus = fields.Integer()
    reference_run = fields.Integer()
    alleles = JSONEncodedField()


class LocusSetSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = LocusSet


class LocusSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = Locus
    locus_metadata = JSONEncodedField()


class LadderSchema(BaseSchema):
    class Meta(BaseSchema.Meta):
        model = Ladder
    base_sizes = JSONEncodedField()


class PlateSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = Plate
    power = JSONEncodedField()
    current = JSONEncodedField()
    voltage = JSONEncodedField()
    temperature = JSONEncodedField()


class PlateListSchema(PlateSchema):
    class Meta(BaseSchema.Meta):
        model = Plate
    wells = fields.List(fields.Integer())


class WellSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = Well
    base_sizes = JSONEncodedField()
    ladder_peak_indices = JSONEncodedField()
    offscale_indices = JSONEncodedField()


class WellListSchema(WellSchema):
    class Meta(BaseSchema.Meta):
        model = Well


class ChannelSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = Channel
    data = JSONEncodedField()


class ChannelListSchema(ChannelSchema):
    class Meta(BaseSchema.Meta):
        model = Channel
        exclude = ['data']


class DeferredChannelSchema(BaseSchema, Flaggable):
    class Meta(BaseSchema.Meta):
        model = Channel
    locus = fields.Integer()
    well = fields.Integer()
    sample = fields.Integer()
