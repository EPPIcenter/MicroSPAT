from sqlalchemy.orm import make_transient, reconstructor

from app import db
from app.microspat.bin_finder import BinFinder as BinFinder
from app.microspat.models.attributes import Flaggable, TimeStamped


class Bin(Flaggable, BinFinder.Bin, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_bin_set_id = db.Column(db.Integer, db.ForeignKey('locus_bin_set.id', ondelete="CASCADE"), index=True, nullable=False)
    label = db.Column(db.Text, nullable=False)
    base_size = db.Column(db.Float, nullable=False)
    bin_buffer = db.Column(db.Float, nullable=False)
    peak_count = db.Column(db.Integer)

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def get_serialized_list(cls, project_id):
        from app.microspat.models import LocusBinSet

        bins = cls.query.join(LocusBinSet).filter(LocusBinSet.project_id == project_id).values(
            cls.id, cls.locus_bin_set_id, cls.label, cls.base_size, cls.bin_buffer, cls.peak_count, cls.last_updated,
            cls.flags, cls.comments
        )

        res = []
        for b in bins:
            r = {
                'id': b[0],
                'locus_bin_set': b[1],
                'label': b[2],
                'base_size': b[3],
                'bin_buffer': b[4],
                'peak_count': b[5],
                'last_updated': b[6],
                'flags': b[7],
                'comments': b[8]
            }
            res.append(r)
        return res


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

    def update(self, **kwargs):
        updated = False
        for k in kwargs.keys():
            updated = True
            setattr(self, k, kwargs[k])

        if updated:
            locus_id = self.locus_bin_set.locus_id
            self.locus_bin_set.project.parameters_changed(locus_id)

    def notify_updated(self):
        self.locus_bin_set.project.parameters_changed(self.locus_bin_set.locus_id)

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
