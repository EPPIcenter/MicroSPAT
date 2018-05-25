from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import make_transient, reconstructor

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from app.microspat.artifact_estimator import ArtifactEstimator as AE
from app.microspat.models.attributes import TimeStamped
from ..artifact_estimator.artifact_equation import ArtifactEquation


class ArtifactEstimator(AE.ArtifactEstimator, TimeStamped, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(255))
    artifact_distance = db.Column(db.Float, nullable=True)
    artifact_distance_buffer = db.Column(db.Float, nullable=True)
    locus_artifact_estimator_id = db.Column(db.Integer,
                                            db.ForeignKey('locus_artifact_estimator.id', ondelete="CASCADE"),
                                            index=True)
    locus_artifact_estimator = db.relationship('LocusArtifactEstimator')
    artifact_equations = db.relationship('ArtifactEquation', lazy='immediate',
                                         cascade='save-update, merge, delete, delete-orphan')
    peak_data = db.Column(MutableList.as_mutable(CompressedJSONEncodedData))

    __table_args__ = {'sqlite_autoincrement': True}

    @classmethod
    def copy_artifact_estimator(cls, ae):
        assert isinstance(ae, cls)
        art_eqs = map(ArtifactEquation.copy_artifact_equation, ae.artifact_equations)

        db.session.expunge(ae)
        make_transient(ae)

        ae.id = None
        ae.artifact_equations = art_eqs

        return ae

    @reconstructor
    def init_on_load(self):
        super(ArtifactEstimator, self).__init__(self.artifact_distance, self.artifact_distance_buffer, self.peak_data,
                                                self.artifact_equations, self.label)

    def generate_estimating_equations(self, parameter_sets):
        for eq in self.artifact_equations:
            db.session.delete(eq)
        self.artifact_equations = []
        artifact_equations = super(ArtifactEstimator, self).generate_estimating_equations(parameter_sets)
        for ae in artifact_equations:
            self.artifact_equations.append(
                ArtifactEquation(sd=ae.sd, r_squared=ae.r_squared, slope=ae.slope, intercept=ae.intercept,
                                 start_size=ae.start_size, end_size=ae.end_size, method=ae.method))

        self.locus_artifact_estimator.project.parameters_changed(self.locus_artifact_estimator.locus_id)
        return self

    def add_breakpoint(self, breakpoint):
        """
        :type breakpoint: float
        """
        old_param_sets = [{
                              'start_size': eq.start_size,
                              'end_size': eq.end_size,
                              'method': eq.method
                          } for eq in self.artifact_equations]

        if any([breakpoint > _['peak_size'] for _ in self.peak_data]):
            param_sets = []
            for param_set in old_param_sets:
                if param_set['start_size'] < breakpoint < param_set['end_size']:
                    param_sets.append({
                        'start_size': param_set['start_size'],
                        'end_size': breakpoint,
                        'method': 'TSR'
                    })
                    param_sets.append({
                        'start_size': breakpoint,
                        'end_size': param_set['end_size'],
                        'method': 'TSR'
                    })
                else:
                    param_sets.append(param_set)
            self.generate_estimating_equations(param_sets)
        return self

    def clear_breakpoints(self):
        param_sets = [{
            'start_size': self.locus_artifact_estimator.locus.min_base_length,
            'end_size': self.locus_artifact_estimator.locus.max_base_length,
            'method': 'TSR'
        }]
        self.generate_estimating_equations(param_sets)
        return self

    def serialize(self):
        res = {
            'id': self.id,
            'label': self.label,
            'artifact_distance': self.artifact_distance,
            'artifact_distance_buffer': self.artifact_distance_buffer,
            'locus_artifact_estimator_id': self.locus_artifact_estimator_id,
            'peak_data': self.peak_data,
            'artifact_equations': sorted([eqn.serialize() for eqn in self.artifact_equations],
                                         key=lambda x: x['start_size'])
        }
        return res