from flask import current_app as app
from sqlalchemy import event

from app import db
from app.microspat.models.utils import params_changed
from ..attributes import PeakScanner


class ProjectLocusParams(PeakScanner, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    locus_id = db.Column(db.Integer, db.ForeignKey("locus.id", ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), index=True)
    project = db.relationship('Project', lazy='immediate', cascade="all, delete-orphan", single_parent=True)
    locus = db.relationship('Locus', lazy='immediate')
    locked = db.Column(db.Boolean, default=False)

    # Peak Filter Params
    min_peak_height = db.Column(db.Integer, default=0, nullable=False)
    max_peak_height = db.Column(db.Integer, default=40000, nullable=False)
    min_peak_height_ratio = db.Column(db.Float, default=0, nullable=False)
    max_bleedthrough = db.Column(db.Float, default=10, nullable=False)
    max_crosstalk = db.Column(db.Float, default=10, nullable=False)
    min_peak_distance = db.Column(db.Float, default=2.2, nullable=False)

    scanning_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)
    filter_parameters_stale = db.Column(db.Boolean, default=True, nullable=False)

    discriminator = db.Column('type', db.String(255))
    __mapper_args__ = {'polymorphic_on': discriminator,
                       'polymorphic_identity': 'base_locus_params'}

    __table_args__ = {'sqlite_autoincrement': True}

    @property
    def filter_parameters(self):
        return {
            'min_peak_height': self.min_peak_height,
            'max_peak_height': self.max_peak_height,
            'min_peak_height_ratio': self.min_peak_height_ratio,
            'max_bleedthrough': self.max_bleedthrough,
            'max_crosstalk': self.max_crosstalk,
            'min_peak_distance': self.min_peak_distance
        }

    @staticmethod
    def stale_parameters(mapper, connection, target):
        assert isinstance(target, ProjectLocusParams)
        filter_params = target.filter_parameters.keys()
        scanning_params = target.scanning_parameters.keys()

        if params_changed(target, scanning_params):
            target.set_scanning_parameters_stale()
        elif params_changed(target, filter_params):
            target.set_filter_parameters_stale()

        app.logger.debug("Filter Parameters Stale: {}".format(target.filter_parameters_stale))
        app.logger.debug("Scanning Parameters Stale: {}".format(target.scanning_parameters_stale))

    @classmethod
    def __declare_last__(cls):
        event.listen(cls, 'before_update', cls.stale_parameters)

    def set_filter_parameters_stale(self):
        self.filter_parameters_stale = True
        self.project.filter_parameters_set_stale(self.locus_id)

    def set_scanning_parameters_stale(self):
        self.set_filter_parameters_stale()
        self.scanning_parameters_stale = True
        self.project.scanning_parameters_set_stale(self.locus_id)

    def set_parameters_stale(self):
        self.set_scanning_parameters_stale()

    def serialize(self):
        res = {
            'id': self.id,
            'locus_id': self.locus_id,
            'project_id': self.project_id,
            'filter_parameters_stale': self.filter_parameters_stale,
            'scanning_parameters_stale': self.scanning_parameters_stale
        }
        res.update(self.scanning_parameters)
        res.update(self.filter_parameters)
        return res

    def __repr__(self):
        return "<{} {} {}>".format(self.__class__.__name__, self.locus.label, self.locus.color)


