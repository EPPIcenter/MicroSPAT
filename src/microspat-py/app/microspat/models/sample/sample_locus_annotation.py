from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import make_transient

from app import db

from app.custom_sql_types.custom_types import CompressedJSONEncodedData

from app.microspat.models.attributes import TimeStamped, Flaggable


class SampleLocusAnnotation(TimeStamped, Flaggable, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id", ondelete="CASCADE"), index=True)
    sample_annotations_id = db.Column(db.Integer, db.ForeignKey("project_sample_annotations.id", ondelete="CASCADE"),
                                      index=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"), index=True)
    locus = db.relationship('Locus', lazy='immediate')
    annotated_peaks = db.Column(MutableList.as_mutable(CompressedJSONEncodedData), default=[])
    reference_run_id = db.Column(db.Integer, db.ForeignKey('project_channel_annotations.id', ondelete="SET NULL"),
                                 index=True)
    reference_run = db.relationship('ProjectChannelAnnotations', lazy='select')
    discriminator = db.Column('type', db.String(255))

    __mapper_args__ = {'polymorphic_on': discriminator,
                       'polymorphic_identity': 'base_sample_locus_annotation'}

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def copy_sample_locus_annotation(cls, annotation):
        db.session.expunge(annotation)
        make_transient(annotation)
        annotation.id = None
        return annotation

    @classmethod
    def get_serialized_list(cls, project_id):
        slas = cls.query.filter(cls.project_id == project_id).values(
            cls.id, cls.project_id, cls.sample_annotations_id, cls.locus_id, cls.annotated_peaks, cls.reference_run_id,
            cls.flags, cls.comments, cls.last_updated
        )

        res = []
        for s in slas:
            r = {
                'id': s[0],
                'project': s[1],
                'sample_annotations': s[2],
                'locus': s[3],
                'annotated_peaks': s[4],
                'reference_run': s[5],
                'flags': s[6],
                'comments': s[7],
                'last_updated': s[8]
            }
            res.append(r)
        return res

    def __init__(self, locus_id, project_id):
        self.locus_id = locus_id
        self.project_id = project_id

    def __repr__(self):
        return "<SampleLocusAnnotation {}>".format(self.locus.label)

    def clear_annotated_peaks(self):
        self.annotated_peaks = []

    def serialize(self):
        res = {
            'id': self.id,
            'sample_annotations_id': self.sample_annotations_id,
            'locus_id': self.locus_id,
            'annotated_peaks': self.annotated_peaks,
            'reference_run_id': self.reference_run_id,
            'reference_channel_id': None,
            'flags': self.flags,
            'comments': self.comments
        }

        if self.reference_run_id:
            res.update({
                'reference_channel_id': self.reference_run.channel_id
            })

        return res
