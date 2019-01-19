from app import db
from app.microspat.models import TimeStamped


class ControlSampleAssociation(TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    control_id = db.Column(db.Integer, db.ForeignKey("control.id", ondelete="CASCADE"), index=True,
                           nullable=False)
    control = db.relationship('Control')
    sample_annotation_id = db.Column(db.Integer, db.ForeignKey("project_sample_annotations.id", ondelete="CASCADE"),
                                     index=True, nullable=False)
    sample_annotation = db.relationship("ProjectSampleAnnotations", lazy='immediate')
    proportion = db.Column(db.Float, nullable=False)

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        return f"<ControlSampleAssociation {self.control.barcode} at {self.proportion} Relative Proportion>"

    @classmethod
    def get_serialized_list(cls, project_id):
        from app.microspat.models import ProjectSampleAnnotations
        control_sample_associations = cls.query \
            .join(ProjectSampleAnnotations) \
            .filter(ProjectSampleAnnotations.project_id == project_id) \
            .values(cls.id, cls.control_id, cls.sample_annotation_id, cls.proportion)

        res = [
            {
                'id': _[0],
                'control': _[1],
                'sample_annotation': _[2],
                'proportion': _[3]
            }
            for _ in control_sample_associations
        ]
        return res
