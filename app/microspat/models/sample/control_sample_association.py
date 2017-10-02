from app import db


class ControlSampleAssociation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    control_id = db.Column(db.Integer, db.ForeignKey("control.id", ondelete="CASCADE"), index=True,
                           nullable=False)
    control = db.relationship('Control', lazy='immediate')
    sample_annotation_id = db.Column(db.Integer, db.ForeignKey("project_sample_annotations.id", ondelete="CASCADE"),
                                     index=True, nullable=False)
    sample_annotation = db.relationship("ProjectSampleAnnotations", lazy='immediate')
    proportion = db.Column(db.Float, nullable=False)

    __table_args__ = {'sqlite_autoincrement': True}

    def __repr__(self):
        return "<ControlSampleAssociation {} at {} Relative Proportion>".format(self.control.barcode, self.proportion)


