from sqlalchemy.orm import make_transient, reconstructor

from app import db
from app.microspat.bin_finder import BinFinder as BinFinder
from ..attributes import Flaggable


class Bin(Flaggable, BinFinder.Bin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_bin_set_id = db.Column(db.Integer, db.ForeignKey('locus_bin_set.id', ondelete="CASCADE"), index=True)
    label = db.Column(db.Text, nullable=False)
    base_size = db.Column(db.Float, nullable=False)
    bin_buffer = db.Column(db.Float, nullable=False)
    peak_count = db.Column(db.Integer)

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def copy_bin(cls, b):
        db.session.expunge(b)
        make_transient(b)
        b.id = None
        return b

    def __repr__(self):
        return "<Bin {}>".format(self.label)

    @reconstructor
    def init_on_load(self):
        super(Bin, self).__init__(self.label, self.base_size, self.bin_buffer, self.peak_count)

    def serialize(self):
        res = {
            'id': self.id,
            'locus_bin_set_id': self.locus_bin_set_id,
            'label': self.label,
            'base_size': self.base_size,
            'bin_buffer': self.bin_buffer,
            'peak_count': self.peak_count
        }
        return res