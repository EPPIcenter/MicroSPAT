from sqlalchemy.ext.mutable import MutableList

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from app.microspat.models.attributes import PeakScanner, Colored, TimeStamped


class Ladder(PeakScanner, Colored, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(255), unique=True, nullable=False, index=True)
    base_sizes = db.Column(MutableList.as_mutable(CompressedJSONEncodedData), nullable=False)

    sq_limit = db.Column(db.Float, default=1, nullable=False)
    unusable_sq_limit = db.Column(db.Float, default=10, nullable=False)
    base_size_precision = db.Column(db.Integer, default=2, nullable=False)

    index_overlap = db.Column(db.Integer, default=15, nullable=False)
    min_time = db.Column(db.Integer, default=1200, nullable=False)
    max_peak_height = db.Column(db.Integer, default=24000, nullable=False)
    min_peak_height = db.Column(db.Integer, default=200, nullable=False)
    outlier_limit = db.Column(db.Integer, default=3, nullable=False)
    maximum_missing_peak_count = db.Column(db.Integer, default=5, nullable=False)
    allow_bleedthrough = db.Column(db.Boolean, default=True, nullable=False)
    remove_outliers = db.Column(db.Boolean, default=True, nullable=False)

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        return "<Ladder {} {}>".format(self.label, self.color.capitalize())

    @property
    def filter_parameters(self):
        return {
            'index_overlap': self.index_overlap,
            'min_time': self.min_time,
            'max_peak_height': self.max_peak_height,
            'min_peak_height': self.min_peak_height,
            'outlier_limit': self.outlier_limit,
            'maximum_missing_peak_count': self.maximum_missing_peak_count,
            'allow_bleedthrough': self.allow_bleedthrough,
            'remove_outliers': self.remove_outliers,
        }

    @property
    def filter_parameters_v2(self):
        return {
            'indexOverlap': self.index_overlap,
            'minTime': self.min_time,
            'maxPeakHeight': self.max_peak_height,
            'minPeakHeight': self.min_peak_height,
            'outlierLimit': self.outlier_limit,
            'maximumMissingPeakCount': self.maximum_missing_peak_count,
            'allowBleedthrough': self.allow_bleedthrough,
            'removeOutliers': self.remove_outliers
        }

    def v2_serialize(self):
        res = {}
        r = self.serialize()
        for k in list(r):
            camel_case_key = k.split('_')
            camel_case_key = camel_case_key[0] + "".join(_.title() for _ in camel_case_key[1:])
            res[camel_case_key] = r[k]
        res.pop('sqLimit')
        res.pop('unusableSqLimit')
        res['SQLimit'] = r['sq_limit']
        res['unusableSQLimit'] = r['unusable_sq_limit']
        return res

    def serialize(self):
        res = {
            'id': self.id,
            'label': self.label,
            'base_sizes': self.base_sizes,
            'sq_limit': self.sq_limit,
            'unusable_sq_limit': self.unusable_sq_limit,
            'base_size_precision': self.base_size_precision,
            'color': self.color
        }
        res.update(self.filter_parameters)
        res.update(self.scanning_parameters)
        return res
