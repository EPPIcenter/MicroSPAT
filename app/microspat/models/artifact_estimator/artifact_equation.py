from sqlalchemy.orm import make_transient, reconstructor

from app import db
from app.microspat.artifact_estimator import ArtifactEstimator
from ..attributes import Flaggable, TimeStamped


class ArtifactEquation(Flaggable, ArtifactEstimator.ArtifactEquation, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    artifact_estimator_id = db.Column(db.Integer, db.ForeignKey('artifact_estimator.id', ondelete="CASCADE"),
                                      index=True)
    sd = db.Column(db.Float, nullable=False)
    r_squared = db.Column(db.Float, nullable=True)
    slope = db.Column(db.Float, nullable=False)
    intercept = db.Column(db.Float, nullable=False)
    start_size = db.Column(db.Float, nullable=False)
    end_size = db.Column(db.Float, nullable=False)
    method = db.Column(db.String(255), default='TSR', nullable=False)

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def copy_artifact_equation(cls, ae):
        db.session.expunge(ae)
        make_transient(ae)
        ae.id = None
        return ae

    def __repr__(self):
        return "<Artifact Equation y = {}x + {} ({})".format(self.slope, self.intercept, self.method)

    @reconstructor
    def init_on_load(self):
        super(ArtifactEquation, self).__init__(self.sd, self.r_squared, self.slope, self.intercept, self.start_size,
                                               self.end_size, self.method)

    def serialize(self):
        res = {
            'id': self.id,
            'artifact_estimator_id': self.artifact_estimator_id,
            'sd': self.sd,
            'r_squared': self.r_squared,
            'slope': self.slope,
            'intercept': self.intercept,
            'start_size': self.start_size,
            'end_size': self.end_size,
            'method': self.method
        }
        return res