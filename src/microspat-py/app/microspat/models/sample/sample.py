from collections import defaultdict

from sqlalchemy.orm import validates, defer

from app import db
from app.microspat.models.ce.channel import Channel
from app.microspat.models.attributes import TimeStamped, Flaggable
from app.microspat.models.sample.exceptions import SampleException

from app.utils import CaseInsensitiveDictReader


class Sample(TimeStamped, Flaggable, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    barcode = db.Column(db.String(255), nullable=False, unique=True)
    designation = db.Column(db.String(255), nullable=False, default='sample', index=True)
    channels = db.relationship('Channel', backref=db.backref('sample'), lazy='immediate')

    __table_args__ = {'sqlite_autoincrement': True}

    @validates('designation')
    def validate_designation(self, key, designation):
        assert designation in ['sample', 'positive_control', 'negative_control']
        return designation

    @classmethod
    def get_serialized_list(cls):
        samples = Sample.query.values(cls.id, cls.barcode, cls.designation, cls.comments, cls.flags)

        channels = Channel.query.filter(Channel.sample_id.isnot(None)).values(Channel.id, Channel.sample_id)
        channel_dict = defaultdict(list)
        for channel in channels:
            channel_dict[channel.sample_id].append(channel)

        sample_results = []
        for res in samples:
            r = {
                'id': res[0],
                'barcode': res[1],
                'designation': res[2],
                'comments': res[3],
                'flags': res[4],
                'channels': channel_dict[res[0]]
            }
            sample_results.append(r)
        return sample_results

    def serialize(self):
        return {
            'id': self.id,
            'barcode': self.barcode,
            'comments': self.comments,
            'designation': self.designation,
            'last_updated': str(self.last_updated)
        }

    def __repr__(self):
        return "<{} {}>".format(self.__class__.__name__, self.barcode)


def load_samples_from_csv(f):
    positive_designations = ['pos', 'positive_control', 'positive', 'positive control', '+', 'pc']
    negative_designations = ['neg', 'negative_control', 'negative', 'negative control', '-', 'nc']
    sample_designations = ['s', 'sample', '']

    r = CaseInsensitiveDictReader(f)

    if sorted(r.fieldnames) != ['barcode', 'designation']:
        raise SampleException("CSV fieldnames invalid. Header must be ['Barcode', 'Designation']")

    samples = []
    for sample_entry in r:
        if sample_entry['designation'].lower() in positive_designations:
            sample_entry['designation'] = 'positive_control'
        elif sample_entry['designation'].lower() in negative_designations:
            sample_entry['designation'] = 'negative_control'
        elif sample_entry['designation'].lower() in sample_designations:
            sample_entry['designation'] = 'sample'
        else:
            raise SampleException("Sample designation {} is not valid".format(sample_entry['designation']))

        barcode = sample_entry['barcode']
        designation = sample_entry['designation']

        sample = Sample(barcode=barcode, designation=designation)
        samples.append(sample)

    return samples

