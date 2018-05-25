import csv
from datetime import datetime

import eventlet
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import deferred, validates, reconstructor

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from app.microspat.fsa_tools.PlateExtractor import ExtractedPlate
from ..attributes import TimeStamped, Flaggable
from ..locus.locus import Locus
from ..sample.sample import Sample
from ..ce.well import Well
from ..ce.channel import Channel
from ..ce.ladder import Ladder


class Plate(ExtractedPlate, TimeStamped, Flaggable, db.Model):
    """
    Immutable data about plate sourced from zip of FSA Files
    """
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(255), nullable=False, index=True)
    creator = db.Column(db.String(255), nullable=True)
    date_processed = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    date_run = db.Column(db.Date, nullable=False, index=True)
    well_arrangement = db.Column(db.Integer, nullable=False, default=96)
    ce_machine = db.Column(db.String(255), default="Unknown")
    wells = db.relationship('Well', backref=db.backref('plate'), cascade='save-update, merge, delete, delete-orphan')
    plate_hash = db.Column(db.String(32), nullable=False, unique=True, index=True)
    power = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))
    current = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))
    voltage = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))
    temperature = deferred(db.Column(MutableList.as_mutable(CompressedJSONEncodedData)))

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        return "<Plate {0}>".format(self.label)

    @validates('well_arrangement')
    def validate_well_arrangement(self, key, well_arrangement):
        assert well_arrangement in [96, 384]
        return well_arrangement

    @reconstructor
    def init_on_load(self):
        super(Plate, self).__init__(label=self.label, well_arrangement=self.well_arrangement, wells=self.wells,
                                    date_run=self.date_run, creator=self.creator, comments=self.comments,
                                    ce_machine=self.ce_machine, plate_hash=self.plate_hash, power=self.power,
                                    current=self.current, voltage=self.voltage, temperature=self.temperature)

    @classmethod
    def get_serialized_list(cls):
        plates = cls.query.values(cls.id, cls.label, cls.creator, cls.date_processed, cls.date_run,
                                  cls.well_arrangement, cls.ce_machine, cls.plate_hash, cls.last_updated, cls.flags,
                                  cls.current, cls.voltage, cls.power, cls.temperature, cls.comments)
        res = []
        for p in plates:
            wells = Well.query.filter(Well.plate_id == p[0]).values(Well.id)
            wells = [_[0] for _ in wells]
            r = {'id': p[0],
                 'label': p[1],
                 'creator': p[2],
                 'date_processed': p[3],
                 'date_run': p[4],
                 'well_arrangement': p[5],
                 'ce_machine': p[6],
                 'plate_hash': p[7],
                 'last_updated': p[8],
                 'flags': p[9],
                 'current': p[10],
                 'voltage': p[11],
                 'power': p[12],
                 'temperature': p[13],
                 'comments': p[14],
                 'wells': wells}
            res.append(r)
        return res

    @classmethod
    def from_extracted_plate(cls, extracted_plate, ladder):
        p = cls(label=extracted_plate.label, comments=extracted_plate.comments, creator=extracted_plate.creator,
                date_run=extracted_plate.date_run, well_arrangement=extracted_plate.well_arrangement,
                ce_machine=extracted_plate.ce_machine, plate_hash=extracted_plate.plate_hash,
                current=extracted_plate.current, voltage=extracted_plate.voltage,
                temperature=extracted_plate.temperature, power=extracted_plate.power)
        db.session.add(p)
        eventlet.sleep()

        for well in extracted_plate.wells:
            w = Well(well_label=well.well_label, comments=well.comments, base_sizes=well.base_sizes,
                     ladder_peak_indices=well.ladder_peak_indices, sizing_quality=well.sizing_quality,
                     offscale_indices=well.offscale_indices, fsa_hash=well.fsa_hash)

            w.plate = p
            w.ladder = ladder
            db.session.add(w)
            eventlet.sleep()

            for channel in well.channels:
                c = Channel(wavelength=channel.wavelength, data=channel.data, color=channel.color)
                c.well = w
                db.session.add(c)
                eventlet.sleep()
        return p

    @classmethod
    def from_zip(cls, zip_file, ladder, creator=None, comments=None, add_to_db=True):
        extracted_plate = ExtractedPlate.from_zip(zip_file, creator, comments)

        if type(ladder) == int:
            ladder = Ladder.query.get(ladder)

        extracted_plate = extracted_plate.calculate_base_sizes(ladder=ladder.base_sizes, color=ladder.color,
                                                               base_size_precision=ladder.base_size_precision,
                                                               sq_limit=ladder.sq_limit,
                                                               filter_parameters=ladder.filter_parameters,
                                                               scanning_parameters=ladder.scanning_parameters)

        p = cls(label=extracted_plate.label, comments=extracted_plate.comments, creator=extracted_plate.creator,
                date_run=extracted_plate.date_run, well_arrangement=extracted_plate.well_arrangement,
                ce_machine=extracted_plate.ce_machine, plate_hash=extracted_plate.plate_hash,
                current=extracted_plate.current, voltage=extracted_plate.voltage,
                temperature=extracted_plate.temperature, power=extracted_plate.power)

        if add_to_db:
            db.session.add(p)

        for well in extracted_plate.wells:
            w = Well(well_label=well.well_label, comments=well.comments, base_sizes=well.base_sizes,
                     ladder_peak_indices=well.ladder_peak_indices, sizing_quality=well.sizing_quality,
                     offscale_indices=well.offscale_indices, fsa_hash=well.fsa_hash)

            w.plate = p
            w.ladder = ladder

            if add_to_db:
                db.session.add(w)

            for channel in well.channels:
                c = Channel(wavelength=channel.wavelength, data=channel.data, color=channel.color)
                c.well = w
                if add_to_db:
                    db.session.add(c)
        return p

    @classmethod
    def from_zips(cls, zip_files, ladder_id, creator=None, comments=None):
        plate_ids = []
        for z in zip_files:
            plate_ids.append(cls.from_zip(z, ladder_id, creator, comments))
        return plate_ids

    def load_plate_map(self, plate_map_file):
        r = csv.DictReader(plate_map_file)
        locus_labels = r.fieldnames
        locus_labels = [x for x in locus_labels if x.lower() not in ['', 'well']]
        for entry in r:
            well_label = entry['Well']
            for locus_label in locus_labels:
                sample_barcode = entry[locus_label]
                sample = Sample.query.filter(Sample.barcode == sample_barcode).one()
                locus = Locus.query.filter(Locus.label == locus_label).one()
                well = self.wells_dict[well_label]
                channel = well.channels_dict[locus.color]
                if channel and locus and sample:
                    channel.add_locus(locus.id)
                    channel.add_sample(sample.id)
        return self

    def check_contamination(self):
        self.set_flag('contamination_count', 0)
        channels = Channel.query.join(Well).join(Plate).join(Sample).filter(Plate.id == self.id) \
            .filter(Sample.designation == 'negative_control').all()
        for channel in channels:
            channel.check_contamination()
        return self

    def set_contamination_flag(self, wavelength):
        if self.get_flag('contamination_count', None):
            self.set_flag('contamination_count', self.get_flag('contamination_count') + 1)
        else:
            self.set_flag('contamination_count', 1)
        channels = Channel.query.join(Well).join(Plate).filter(Plate.id == self.id).filter(
            Channel.wavelength == wavelength).all()
        for channel in channels:
            channel.set_flag('contamination', True)
        return self

    def unset_contamination_flag(self, wavelength):
        if self.get_flag('contamination_count', None):
            self.set_flag('contamination_count', self.get_flag('contamination_count') - 1)
            channels = Channel.query.join(Plate).filter(Plate.id == self.id).filter(
                Channel.wavelength == wavelength).all()
            for channel in [_ for _ in channels if _.designation == 'negative_control']:
                if channel.flags.get('contamination', None):
                    return self

            for channel in [_ for _ in channels if _.designation != 'negative_control']:
                channel.flags.set('contamination', False)
        self.set_flag('contamination_count', 0)
        return self

    def serialize(self):
        return {
            'id': self.id,
            'label': self.label,
            'creator': self.creator,
            'date_processed': str(self.date_processed),
            'date_run': str(self.date_run),
            'well_arrangement': self.well_arrangement,
            'ce_machine': self.ce_machine,
            'plate_hash': self.plate_hash,
            'last_updated': str(self.last_updated),
            'wells': {w.well_label: w.serialize() for w in self.wells}
        }
