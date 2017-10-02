from sqlalchemy.orm import make_transient

from app import db
from ..attributes import TimeStamped
from ..sample.sample import Sample
from ..sample.sample_locus_annotation import SampleLocusAnnotation


class ProjectSampleAnnotations(TimeStamped, db.Model):
    """
    Sample level analysis in a project.
    """
    id = db.Column(db.Integer, primary_key=True)
    sample_id = db.Column(db.Integer, db.ForeignKey('sample.id', ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id', ondelete="CASCADE"), index=True)
    sample = db.relationship('Sample', lazy='select')
    src_project = db.relationship('Project', lazy='select')
    assigned_controls = db.relationship('ControlSampleAssociation', lazy='select')
    moi = db.Column(db.Integer)
    locus_annotations = db.relationship('SampleLocusAnnotation', backref=db.backref('sample_annotation'),
                                        cascade='save-update, merge, delete, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('project_id', 'sample_id', name='_project_sample_uc'),
        {'sqlite_autoincrement': True}
    )

    @classmethod
    def copy_project_sample_annotations(cls, psa):
        locus_annotations = map(SampleLocusAnnotation.copy_sample_locus_annotation, psa.locus_annotations)
        db.session.expunge(psa)
        make_transient(psa)
        psa.id = None

        psa.locus_annotations = locus_annotations
        return psa

    def serialize(self):
        if self.sample_id and not self.sample:
            self.sample = Sample.query.get(self.sample_id)
        res = {
            'id': self.id,
            'sample': self.sample.serialize(),
            'project_id': self.project_id,
            'moi': self.moi,
            'last_updated': self.last_updated,
        }
        return res

    def serialize_details(self):
        res = self.serialize()
        res.update({
            'locus_annotations': {x.locus_id: x.serialize() for x in self.locus_annotations}
        })
        return res
