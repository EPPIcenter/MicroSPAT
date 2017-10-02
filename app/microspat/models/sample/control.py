from sqlalchemy.ext.mutable import MutableDict

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from ..attributes import TimeStamped
from ..sample.exceptions import InvalidAllelesException


class Control(TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    barcode = db.Column(db.String(255), nullable=False)
    bin_estimator_id = db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id'), index=True, nullable=False)
    bin_estimator = db.relationship('BinEstimatorProject')
    alleles = db.Column(MutableDict.as_mutable(CompressedJSONEncodedData))

    __table_args__ = (
        db.UniqueConstraint('barcode', 'bin_estimator_id', name='_barcode_bin_estimator_uc'),
        {'sqlite_autoincrement': True}
    )

    def __init__(self, barcode, bin_estimator_id):
        from ..bin_estimator.project import BinEstimatorProject
        bin_estimator = BinEstimatorProject.query.get_or_404(bin_estimator_id)

        assert isinstance(bin_estimator, BinEstimatorProject)
        self.bin_estimator_id = bin_estimator_id
        self.bin_estimator = bin_estimator
        self.barcode = barcode
        self.initialize_alleles()

    def initialize_alleles(self):
        from ..bin_estimator.locus_bin_set import LocusBinSet
        self.alleles = {}
        for bin_set in self.bin_estimator.locus_bin_sets:
            assert isinstance(bin_set, LocusBinSet)
            self.alleles[str(bin_set.locus_id)] = None
        return self

    def set_alleles(self, alleles):
        if self.alleles_valid(alleles):
            self.alleles = alleles
        else:
            raise InvalidAllelesException()
        return self

    def alleles_valid(self, alleles):
        valid_locus_ids = [str(_.id) for _ in self.bin_estimator.locus_set.loci]
        for locus_id in alleles.keys():
            if str(locus_id) in valid_locus_ids:
                be_bin_set = next((_ for _ in self.bin_estimator.locus_bin_sets if _.locus_id == int(locus_id)), None)
                if be_bin_set:
                    valid_bin_ids = [str(_.id) for _ in be_bin_set.bins]
                    if alleles[locus_id] and str(alleles[locus_id]) not in valid_bin_ids:
                        return False
                else:
                    return False
            else:
                return False
        return True

    def serialize(self):
        return {
            'id': self.id,
            'barcode': self.barcode,
            'bin_estimator_id': self.bin_estimator_id,
            'bin_estimator': self.bin_estimator.serialize(),
            'alleles': self.alleles
        }

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'bin_estimator': self.bin_estimator.serialize_details()
        })
        return res

    def __repr__(self):
        return "<{} {}>".format(self.__class__.__name__, self.barcode)

