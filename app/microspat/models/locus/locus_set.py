import json

from app import db
from ..locus.locus import Locus


locus_set_association_table = db.Table('locus_set_association',
                                       db.Column('locus_id', db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE")),
                                       db.Column('locus_set_id', db.Integer,
                                                 db.ForeignKey('locus_set.id', ondelete="CASCADE"))
                                       )


class LocusSet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    loci = db.relationship('Locus', secondary=locus_set_association_table)
    label = db.Column(db.String(255), nullable=False)

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        return "<LocusSet {}>".format(self.label)

    def to_json(self):
        """
        Dump locus set to json string
        :return: string representation of locus set
        """
        dump = {
            'label': self.label,
            'loci': [{
                         'label': locus.label,
                         'max_base_length': locus.max_base_length,
                         'min_base_length': locus.min_base_length,
                         'nucleotide_repeat_length': locus.nucleotide_repeat_length,
                         'color': locus.color
                     } for locus in self.loci]
        }
        return json.dumps(dump)

    @classmethod
    def from_json(cls, json_string):
        parsed_locus_set = json.loads(json_string)
        loci = []
        for locus in parsed_locus_set['loci']:
            l = Locus(**locus)
            loci.append(l)
        locus_set = LocusSet(label=parsed_locus_set['label'], loci=loci)
        return locus_set

    def serialize(self):
        res = {
            'id': self.id,
            'label': self.label,
            'loci': {locus.id: locus.serialize() for locus in self.loci}
        }
        return res