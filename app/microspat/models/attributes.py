from datetime import datetime

from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import validates

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData


class Colored(object):
    color = db.Column(db.String(6), nullable=False)

    @validates('color')
    def validate_color(self, _, color):
        assert color in ['orange', 'red', 'yellow', 'green', 'blue']
        return color


class PeakScanner(object):
    scanning_method = db.Column(db.Text, default='relmax', nullable=False)
    maxima_window = db.Column(db.Integer, default=10, nullable=False)

    # relmax Scanning Params
    argrelmax_window = db.Column(db.Integer, default=6, nullable=False)
    trace_smoothing_window = db.Column(db.Integer, default=11, nullable=False)
    trace_smoothing_order = db.Column(db.Integer, default=7, nullable=False)
    tophat_factor = db.Column(db.Float, default=.005, nullable=False)

    # CWT Scanning Params
    cwt_min_width = db.Column(db.Integer, default=4, nullable=False)
    cwt_max_width = db.Column(db.Integer, default=15, nullable=False)
    min_snr = db.Column(db.Float, default=3, nullable=False)
    noise_perc = db.Column(db.Float, default=13, nullable=False)
    gap_threshold = db.Column(db.Integer, default=2)

    @validates('scanning_method')
    def validate_scanning_method(self, _, scanning_method):
        assert scanning_method in ['cwt', 'relmax']
        return scanning_method

    @property
    def scanning_parameters(self):
        return {
            'scanning_method': self.scanning_method,
            'maxima_window': self.maxima_window,
            'argrelmax_window': self.argrelmax_window,
            'trace_smoothing_window': self.trace_smoothing_window,
            'trace_smoothing_order': self.trace_smoothing_order,
            'tophat_factor': self.tophat_factor,
            'cwt_min_width': self.cwt_min_width,
            'cwt_max_width': self.cwt_max_width,
            'min_snr': self.min_snr,
            'noise_perc': self.noise_perc,
            'gap_threshold': self.gap_threshold
        }


class TimeStamped(object):
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Flaggable(object):
    flags = db.Column(MutableDict.as_mutable(CompressedJSONEncodedData), default={}, nullable=True)
    comments = db.Column(db.Text)

    def set_flag(self, key, value):
        if self.flags:
            self.flags[key] = value
        else:
            self.flags = {key: value}

    def get_flag(self, key, default=None):
        if self.flags:
            return self.flags.get(key, default)
        else:
            return default

    def get_flag_values(self):
        if self.flags:
            return self.flags.values()
        else:
            return []

    def clear_flags(self):
        self.flags = {}
        return self


class LocusSetAssociatedMixin(object):
    @declared_attr
    def locus_set_id(self):
        return db.Column(db.Integer, db.ForeignKey('locus_set.id'), nullable=False, index=True)

    @declared_attr
    def locus_set(self):
        return db.relationship('LocusSet', cascade='save-update, merge')