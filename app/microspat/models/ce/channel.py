from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import deferred, reconstructor

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from app.microspat.config import Config
from app.microspat.fsa_tools.PlateExtractor import ChannelExtractor
from app.microspat.peak_annotator.PeakFilters import base_size_filter, peak_height_filter, bleedthrough_filter, \
    crosstalk_filter, peak_proximity_filter, relative_peak_height_filter
from ..attributes import TimeStamped, Colored, Flaggable
from ..locus.locus import Locus


class Channel(ChannelExtractor, TimeStamped, Colored, Flaggable, db.Model):
    """
    Immutable data about channel within an FSA File
    """
    id = db.Column(db.Integer, primary_key=True)
    well_id = db.Column(db.Integer, db.ForeignKey("well.id", ondelete="CASCADE"), index=True)
    wavelength = db.Column(db.Integer, nullable=False)
    data = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))
    max_data_point = db.Column(db.Integer, default=0)
    ignored = db.Column(db.Boolean, default=False, nullable=False)

    sample_id = db.Column(db.Integer, db.ForeignKey('sample.id'), index=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id'), index=True)
    locus = db.relationship('Locus')

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        if self.locus:
            return "<Channel {} {}>".format(self.locus.label, self.color.capitalize())
        else:
            return "<Channel {}>".format(self.color)

    @reconstructor
    def init_on_load(self):
        super(Channel, self).__init__(color=self.color, wavelength=self.wavelength)

    @property
    def other_channels(self):
        other_channels = [_ for _ in self.well.channels if _.id != self.id]
        return other_channels

    def reinitialize(self):
        self.max_data_point = 0
        self.sample_id = None
        self.locus_id = None

    def filter_to_locus_range(self):
        self.filter_annotated_peaks(
            base_size_filter(min_size=self.locus.min_base_length, max_size=self.locus.max_base_length))

    def pre_annotate_and_filter(self, filter_params):
        self.annotate_base_sizes()
        self.filter_to_locus_range()
        self.annotate_peak_heights()
        self.filter_annotated_peaks(peak_height_filter(min_height=filter_params['min_peak_height'],
                                                       max_height=filter_params['max_peak_height']))
        self.annotate_bleedthrough()
        self.filter_annotated_peaks(bleedthrough_filter(max_bleedthrough_ratio=filter_params['max_bleedthrough']))
        self.annotate_crosstalk()
        self.filter_annotated_peaks(crosstalk_filter(max_crosstalk_ratio=filter_params['max_crosstalk']))
        self.filter_annotated_peaks(peak_proximity_filter(min_peak_distance=filter_params['min_peak_distance']))
        self.annotate_peak_area()

    def post_annotate_peaks(self):
        self.annotate_relative_peak_heights()
        self.annotate_relative_peak_area()

    def post_filter_peaks(self, filter_params):
        self.filter_annotated_peaks(
            relative_peak_height_filter(min_relative_peak_height=filter_params['min_peak_height_ratio']))

    def add_sample(self, sample_id):
        self.sample_id = sample_id
        return self

    def add_locus(self, locus_id):
        locus = Locus.query.get(locus_id)
        self.locus = locus
        self.locus_id = locus_id
        self.find_max_data_point()
        return self

    def find_max_data_point(self):
        if self.locus and self.well.ladder_peak_indices:
            self.well.ladder_peak_indices.sort()
            j = 0
            while self.well.base_sizes[self.well.ladder_peak_indices[j]] < self.locus.min_base_length:
                j += 1
            i = self.well.ladder_peak_indices[j - 1]
            while self.well.base_sizes[i] < self.locus.max_base_length:
                i += 1
                if self.well.base_sizes[i] > self.locus.min_base_length:
                    if self.data[i] > self.max_data_point:
                        self.max_data_point = self.data[i]

    def check_contamination(self):
        if self.sample.designation == 'negative_control':
            if self.max_data_point > Config.CONTAMINATION_LIMIT:
                self.set_flag('contamination', True)
                self.well.plate.set_contamination_flag(self.wavelength)

    def unset_contamination_flag(self):
        if self.get_flag('contamination', False):
            self.set_flag('contamination', False)
            if self.sample.designation == 'negative_control':
                self.well.plate.unset_contamination_flag(self.wavelength)

    def serialize(self):
        res = {
            'id': self.id,
            'well_id': self.well_id,
            'wavelength': self.wavelength,
            'sample_id': self.sample_id,
            'locus_id': self.locus_id,
            'max_data_point': self.max_data_point,
            'data': None
        }
        return res

    def non_recursive_details(self):
        res = self.serialize()
        res.update({
            'data': self.data
        })

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'data': self.data,
            'other_channels': [_.non_recursive_details() for _ in self.other_channels]
        })

        return res