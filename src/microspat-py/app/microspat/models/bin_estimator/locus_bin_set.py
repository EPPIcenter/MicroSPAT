from collections import defaultdict

from sqlalchemy.orm import make_transient, reconstructor

from app import db, socketio
from app.microspat.bin_finder import BinFinder as BinFinder
from app.microspat.models.attributes import TimeStamped
from app.microspat.models.locus.locus import Locus
from app.microspat.models.bin_estimator.bin import Bin


class LocusBinSet(BinFinder.BinFinder, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"), index=True)
    locus = db.relationship('Locus', lazy='immediate')
    project_id = db.Column(db.Integer, db.ForeignKey('bin_estimator_project.id', ondelete="CASCADE"), index=True)
    project = db.relationship('BinEstimatorProject')
    bins = db.relationship('Bin', backref=db.backref('locus_bin_set'), lazy='immediate',
                           cascade='save-update, merge, delete, expunge, delete-orphan')

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def get_serialized_list(cls, project_id):
        lbs = cls.query.filter(cls.project_id == project_id).values(
            cls.id, cls.locus_id, cls.project_id, cls.last_updated
        )

        bins = Bin.query.join(cls).filter(cls.project_id == project_id).values(Bin.id, Bin.locus_bin_set_id)

        bin_map = defaultdict(list)
        for b in bins:
            bin_map[b[1]].append(b[0])

        res = []
        for l in lbs:
            r = {
                'id': l[0],
                'locus': l[1],
                'project': l[2],
                'last_updated': l[3],
                'bins': bin_map[l[0]]
            }
            res.append(r)
        return res

    @classmethod
    def copy_locus_bin_set(cls, lbs):
        bins = list(map(Bin.copy_bin, lbs.bins))

        db.session.expunge(lbs)
        make_transient(lbs)

        lbs.id = None
        lbs.bins = bins

        return lbs

    def __repr__(self):
        return "<Locus Bin Set: {}>".format(self.locus.label)

    @classmethod
    def from_peaks(cls, locus_id, peaks, min_peak_frequency, bin_buffer):
        locus = Locus.query.get(locus_id)
        locus_bin_set = cls()
        locus_bin_set.locus = locus
        db.session.add(locus_bin_set)
        socketio.sleep()

        bin_set = BinFinder.BinFinder.calculate_bins(peaks=peaks,
                                                     nucleotide_repeat_length=locus.nucleotide_repeat_length,
                                                     min_peak_frequency=min_peak_frequency, bin_buffer=bin_buffer)
        socketio.sleep()
        for b in bin_set.bins:
            assert isinstance(b, BinFinder.Bin)
            b = Bin(label=b.label, base_size=b.base_size, bin_buffer=b.bin_buffer, peak_count=b.peak_count)
            locus_bin_set.bins.append(b)
        return locus_bin_set

    @reconstructor
    def init_on_load(self):
        super(LocusBinSet, self).__init__(self.bins)

    def serialize(self):
        res = {
            'id': self.id,
            'locus_id': self.locus_id,
            'project_id': self.project_id,
            'bins': {bin.id: bin.serialize() for bin in self.bins}
        }
        return res
