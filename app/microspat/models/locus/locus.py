from sqlalchemy.ext.mutable import MutableDict

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from app.utils import CaseInsensitiveDictReader
from app.microspat.models.attributes import Colored, TimeStamped
from ..locus.exceptions import LocusException


class Locus(Colored, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(255), unique=True, nullable=False)
    max_base_length = db.Column(db.Integer, nullable=False)
    min_base_length = db.Column(db.Integer, nullable=False)
    nucleotide_repeat_length = db.Column(db.Integer, default=3, nullable=False)
    locus_metadata = db.Column(MutableDict.as_mutable(CompressedJSONEncodedData), default={}, nullable=False)

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        return "<Locus {} {}>".format(self.label, self.color.capitalize())

    def __init__(self, color, label, max_base_length, min_base_length, nucleotide_repeat_length, locus_metadata=None):
        self.locus_metadata = locus_metadata or {}
        self.color = color
        self.label = label
        self.max_base_length = max_base_length
        self.min_base_length = min_base_length
        self.nucleotide_repeat_length = nucleotide_repeat_length

    def serialize(self):
        res = {
            'id': self.id,
            'label': self.label,
            'max_base_length': self.max_base_length,
            'min_base_length': self.min_base_length,
            'nucleotide_repeat_length': self.nucleotide_repeat_length,
            # 'locus_metadata': self.locus_metadata,
            'color': self.color
        }
        return res


def load_loci_from_csv(f):
    r = CaseInsensitiveDictReader(f)

    valid_colors = ['orange', 'red', 'yellow', 'green', 'blue']

    if sorted(r.fieldnames) != ['color', 'label', 'max_base_length', 'min_base_length', 'nucleotide_repeat_length']:
        raise LocusException(
            "CSV fieldnames invalid. Header must be ['Label', 'Min. Base Length', 'Max. Base Length', 'Color', "
            "'Nucleotide Repeat Length']")

    loci = []
    for locus_entry in r:
        label = locus_entry['label']
        color = locus_entry['color'].lower()
        min_base_length = int(locus_entry['min_base_length'])
        max_base_length = int(locus_entry['max_base_length'])
        nucleotide_repeat_length = int(locus_entry['nucleotide_repeat_length'])

        l = Locus.query.filter(Locus.label == label).first()

        if color not in valid_colors:
            raise LocusException("Locus Color {} not valid".format(color))

        if l:
            raise LocusException("Locus {} Already Exists".format(label))

        locus = Locus(label=label, color=color, min_base_length=min_base_length, max_base_length=max_base_length,
                      nucleotide_repeat_length=nucleotide_repeat_length)
        loci.append(locus)

    return loci
