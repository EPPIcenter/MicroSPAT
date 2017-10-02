from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import make_transient

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from ..attributes import TimeStamped, Flaggable


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
            # 'alleles': self.alleles,
            'flags': self.flags,
            'comments': self.comments
        }

        if self.reference_run_id:
            res.update({
                'reference_channel_id': self.reference_run.channel_id
            })

        return res
