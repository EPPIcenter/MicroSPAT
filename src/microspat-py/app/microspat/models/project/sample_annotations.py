from sqlalchemy.orm import make_transient
from collections import defaultdict

from app import db

from app.microspat.models.attributes import TimeStamped
from app.microspat.models.sample.sample import Sample
from app.microspat.models.sample.sample_locus_annotation import SampleLocusAnnotation


class ProjectSampleAnnotations(TimeStamped, db.Model):
    """
    Sample level analysis in a project.
    """
    id = db.Column(db.Integer, primary_key=True)
    sample_id = db.Column(db.Integer, db.ForeignKey('sample.id', ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id', ondelete="CASCADE"), index=True)

    sample = db.relationship('Sample', lazy='immediate')
    assigned_controls = db.relationship('ControlSampleAssociation', lazy='immediate')
    moi = db.Column(db.Integer)
    locus_annotations = db.relationship('SampleLocusAnnotation', backref=db.backref('sample_annotation'),
                                        cascade='save-update, merge, delete, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('project_id', 'sample_id', name='_project_sample_uc'),
        {'sqlite_autoincrement': True}
    )

    @classmethod
    def get_serialized_list(cls, project_id):
        psas = cls.query.filter(cls.project_id == project_id).values(
            cls.id, cls.sample_id, cls.project_id, cls.moi, cls.last_updated
        )

        slas = SampleLocusAnnotation.query.filter(SampleLocusAnnotation.project_id == project_id).values(
            SampleLocusAnnotation.id, SampleLocusAnnotation.sample_annotations_id
        )

        sla_dict = defaultdict(list)
        for sla in slas:
            sla_dict[sla[1]].append(sla[0])

        res = []
        for p in psas:
            r = {
                'id': p[0],
                'sample': p[1],
                'project': p[2],
                'moi': p[3],
                'last_updated': p[4],
                'locus_annotations': sla_dict[p[0]]
            }
            res.append(r)
        return res

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
