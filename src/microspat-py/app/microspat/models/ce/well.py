from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import deferred, reconstructor

from app import db

from app.custom_sql_types.custom_types import CompressedJSONEncodedData

from app.microspat.fsa_tools.PlateExtractor import WellExtractor

from app.microspat.models.attributes import TimeStamped, Flaggable


class Well(WellExtractor, TimeStamped, Flaggable, db.Model):
    """
    Immutable data about well sourced from FSA Files, apart from ladder used.
    """
    id = db.Column(db.Integer, primary_key=True)
    plate_id = db.Column(db.Integer, db.ForeignKey("plate.id", ondelete="CASCADE"), nullable=False, index=True)
    well_label = db.Column(db.String(3), nullable=False)
    base_sizes = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))
    ladder_peak_indices = db.Column(MutableList.as_mutable(CompressedJSONEncodedData))
    sizing_quality = db.Column(db.Float, default=1000)
    channels = db.relationship('Channel', backref=db.backref('well'),
                               cascade='save-update, merge, delete, delete-orphan')
    offscale_indices = db.Column(MutableList.as_mutable(CompressedJSONEncodedData))
    ladder_id = db.Column(db.Integer, db.ForeignKey('ladder.id'), nullable=False, index=True)
    ladder = db.relationship('Ladder')
    fsa_hash = db.Column(db.String(32), nullable=False, unique=True, index=True)
    _channels_dict = None

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        if self.sizing_quality:
            return "<Well {0} {1}>".format(self.well_label, round(self.sizing_quality, 2))
        else:
            return "<Well {0}>".format(self.well_label)

    @reconstructor
    def init_on_load(self):
        super(Well, self).__init__(well_label=self.well_label, comments=self.comments, base_sizes=self.base_sizes,
                                   sizing_quality=self.sizing_quality, offscale_indices=self.offscale_indices,
                                   ladder_peak_indices=self.ladder_peak_indices,
                                   fsa_hash=self.fsa_hash)

    def calculate_base_sizes(self, peak_indices=None):
        ladder = self.ladder.base_sizes
        color = self.ladder.color
        base_size_precision = self.ladder.base_size_precision
        sq_limit = self.ladder.sq_limit
        filter_parameters = self.ladder.filter_parameters
        scanning_parameters = self.ladder.scanning_parameters
        super(Well, self).calculate_base_sizes(ladder=ladder, color=color, peak_indices=peak_indices,
                                               base_size_precision=base_size_precision,
                                               sq_limit=sq_limit, filter_parameters=filter_parameters,
                                               scanning_parameters=scanning_parameters)
        for channel in self.channels:
            channel.find_max_data_point()
            for annotation in channel.annotations:
                annotation.recalculate_channel()

        return self

    def serialize(self):
        return {
            'id': self.id,
            'plate_id': self.plate_id,
            'well_label': self.well_label,
            'sizing_quality': self.sizing_quality,
            'last_updated': str(self.last_updated),
            'offscale_indices': self.offscale_indices,
            'ladder_id': self.ladder_id,
            'fsa_hash': self.fsa_hash,
            'channels': {channel.color: channel.serialize() for channel in self.channels},
            'ladder_peak_indices': None,
            'base_sizes': None
        }

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'ladder_peak_indices': self.ladder_peak_indices,
            'base_sizes': self.base_sizes
        })
        return res
