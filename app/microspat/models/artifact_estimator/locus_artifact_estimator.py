import eventlet
from sqlalchemy.orm import make_transient, reconstructor

from app import db
from app.microspat.artifact_estimator import ArtifactEstimator as AE
from app.microspat.models.attributes import TimeStamped
from ..locus.locus import Locus
from ..artifact_estimator.artifact_estimator import ArtifactEstimator
from ..artifact_estimator.artifact_equation import ArtifactEquation


class LocusArtifactEstimator(AE.ArtifactEstimatorSet, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey('locus.id', ondelete="CASCADE"), index=True)
    locus = db.relationship('Locus')
    project_id = db.Column(db.Integer, db.ForeignKey('artifact_estimator_project.id', ondelete="CASCADE"), index=True)
    project = db.relationship('ArtifactEstimatorProject')
    artifact_estimators = db.relationship('ArtifactEstimator', lazy='immediate',
                                          cascade='save-update, merge, delete, delete-orphan')

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def copy_locus_artifact_estimator(cls, lae):
        assert isinstance(lae, cls)
        artifact_estimators = map(ArtifactEstimator.copy_artifact_estimator, lae.artifact_estimators)

        db.session.expunge(lae)
        make_transient(lae)

        lae.id = None
        lae.artifact_estimators = artifact_estimators

        return lae

    def __repr__(self):
        return "<Artifact Estimator {}>".format(self.locus.label)

    @classmethod
    def from_peaks(cls, locus_id, peak_sets, min_artifact_peak_frequency):
        locus = Locus.query.get(locus_id)
        locus_artifact_estimator = cls()
        locus_artifact_estimator.locus = locus

        db.session.add(locus_artifact_estimator)

        ae = AE.ArtifactEstimatorSet.from_peaks(peak_sets=peak_sets, start_size=locus.min_base_length,
                                                end_size=locus.max_base_length,
                                                min_artifact_peak_frequency=min_artifact_peak_frequency,
                                                nucleotide_repeat_length=locus.nucleotide_repeat_length)

        for estimator in ae.artifact_estimators:
            eventlet.sleep()
            assert isinstance(estimator, AE.ArtifactEstimator)
            artifact_estimator = ArtifactEstimator(artifact_distance=estimator.artifact_distance,
                                                   artifact_distance_buffer=estimator.artifact_distance_buffer,
                                                   peak_data=estimator.peak_data, label=estimator.label)

            for eqn in estimator.artifact_equations:
                eventlet.sleep()
                assert isinstance(eqn, AE.ArtifactEquation)
                artifact_equation = ArtifactEquation(sd=eqn.sd, r_squared=eqn.r_squared, slope=eqn.slope,
                                                     intercept=eqn.intercept, start_size=eqn.start_size,
                                                     end_size=eqn.end_size, method=eqn.method)
                artifact_estimator.artifact_equations.append(artifact_equation)
            locus_artifact_estimator.artifact_estimators.append(artifact_estimator)

        return locus_artifact_estimator

    @reconstructor
    def init_on_load(self):
        super(LocusArtifactEstimator, self).__init__(self.artifact_estimators)

    def serialize(self):
        res = {
            'id': self.id,
            'locus_id': self.locus_id,
            'project_id': self.project_id,
            'artifact_estimators': [artifact_estimator.serialize() for artifact_estimator in self.artifact_estimators]
        }
        return res
