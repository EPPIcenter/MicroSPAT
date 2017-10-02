from sqlalchemy.ext.mutable import MutableDict

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from ..sample.sample_locus_annotation import SampleLocusAnnotation


class Genotype(SampleLocusAnnotation):
    id = db.Column(db.Integer, db.ForeignKey('sample_locus_annotation.id'), primary_key=True)
    alleles = db.Column(MutableDict.as_mutable(CompressedJSONEncodedData))

    __mapper_args__ = {
        'polymorphic_identity': 'sample_locus_genotype',
    }

    def __repr__(self):
        return "<Genotype {}>".format(self.locus.label)

    def clear_alleles(self):
        self.alleles = dict.fromkeys(self.alleles, False)


