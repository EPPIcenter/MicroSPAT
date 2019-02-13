from collections import defaultdict

from sqlalchemy.orm import reconstructor

from app import db, socketio
from app.microspat.models.bin_estimator.locus_params import BinEstimatorLocusParams

from app.microspat.models.bin_estimator.locus_bin_set import LocusBinSet
from app.microspat.models.bin_estimator.bin import Bin
from app.microspat.models.ce.channel import Channel
from app.microspat.models.locus.locus import Locus
from app.microspat.models.project.channel_annotations import ProjectChannelAnnotations
from app.microspat.models.project.sample_annotations import ProjectSampleAnnotations
from app.microspat.models.project.sample_based_project import SampleBasedProject
from app.microspat.models.sample.genotype import Genotype
from app.utils import subset


class BinEstimatorProject(SampleBasedProject):
    id = db.Column(db.Integer, db.ForeignKey('sample_based_project.id', ondelete="CASCADE"), primary_key=True)

    locus_bin_sets = db.relationship('LocusBinSet', lazy='joined',
                                     cascade='save-update, merge, delete, expunge, delete-orphan')

    locus_parameters = db.relationship('BinEstimatorLocusParams', backref=db.backref('bin_estimator_project'),
                                       lazy='joined', cascade="all, delete-orphan")

    __mapper_args__ = {'polymorphic_identity': 'bin_estimator_project'}

    def __init__(self, **kwargs):
        super(BinEstimatorProject, self).__init__(**kwargs)
        self._locus_bin_set = {}

    @reconstructor
    def init_on_load(self):
        super(BinEstimatorProject, self).init_on_load()
        self._locus_bin_set = {}

    @classmethod
    def get_serialized_list(cls):
        projects = BinEstimatorProject.query.values(cls.id, cls.title, cls.date, cls.creator, cls.description,
                                                    cls.locus_set_id, cls.last_updated)

        locus_parameters = BinEstimatorLocusParams.query.values(BinEstimatorLocusParams.id,
                                                                BinEstimatorLocusParams.project_id)

        locus_parameters_dict = defaultdict(list)
        for lp in locus_parameters:
            locus_parameters_dict[lp[1]].append(lp[0])

        locus_bin_sets = LocusBinSet.query.values(LocusBinSet.id, LocusBinSet.project_id)

        locus_bin_sets_dict = defaultdict(list)
        for lb in locus_bin_sets:
            locus_bin_sets_dict[lb.project_id].append(lb.id)

        res = []
        for p in projects:
            r = {
                'id': p[0],
                'title': p[1],
                'date': p[2],
                'creator': p[3],
                'description': p[4],
                'locus_set': p[5],
                'last_updated': p[6],
                'locus_parameters': locus_parameters_dict[p[0]],
                'locus_bin_sets': locus_bin_sets_dict[p[0]]
            }
            res.append(r)
        return res

    @classmethod
    def copy_project(cls, project):
        locus_bin_sets = project.locus_bin_sets
        locus_bin_sets = list(map(LocusBinSet.copy_locus_bin_set, locus_bin_sets))

        project = super(BinEstimatorProject, cls).copy_project(project)

        project.locus_bin_sets = locus_bin_sets

        db.session.flush()

        return project

    @classmethod
    def delete_project(cls, project):
        locus_bin_sets = project.locus_bin_sets
        bins = Bin.query.join(LocusBinSet).filter(LocusBinSet.project_id == project.id).all()

        to_delete = bins + locus_bin_sets
        for element in to_delete:
            db.session.delete(element)

        super(BinEstimatorProject, cls).delete_project(project)

        db.session.delete(project)

    def remove_samples(self, sample_ids):
        for sample_id_subset in subset(sample_ids, 100):
            self._remove_samples(sample_id_subset)

        for locus in self.locus_set.loci:
            self.samples_changed(locus.id)

        return self

    def _remove_samples(self, sample_ids):
        psas = []
        genotypes = []
        pcas = []

        for id in sample_ids:
            psa = ProjectSampleAnnotations.query.filter(
                ProjectSampleAnnotations.project_id == self.id,
                ProjectSampleAnnotations.sample_id == id
            ).all()
            psas += psa

            genotype = Genotype.query.filter(
                Genotype.project_id == self.id
            ).join(
                ProjectSampleAnnotations
            ).filter(
                ProjectSampleAnnotations.sample_id == id
            ).all()
            genotypes += genotype

            pca = ProjectChannelAnnotations.query.filter(
                ProjectChannelAnnotations.project_id == self.id
            ).join(Channel).filter(
                Channel.sample_id == id
            ).all()
            pcas += pca


        # psas = ProjectSampleAnnotations.query.filter(
        #     ProjectSampleAnnotations.project_id == self.id,
        #     ProjectSampleAnnotations.sample_id.in_(sample_ids)
        # ).all()
        #
        # genotypes = Genotype.query.filter(Genotype.project_id == self.id)\
        #     .join(ProjectSampleAnnotations)\
        #     .filter(ProjectSampleAnnotations.sample_id.in_(sample_ids)).all()

        # pcas = ProjectChannelAnnotations.query.filter(
        #     ProjectChannelAnnotations.project_id == self.id
        # ).join(Channel).filter(
        #     Channel.sample_id.in_(sample_ids)
        # ).all()

        for _ in psas + genotypes + pcas:
            db.session.delete(_)

    def annotate_channel(self, channel_annotation):
        pass

    def parameters_changed(self, locus_id):
        # TODO: Figure out a better way of notifying BinEstimating projects that the bin estimator has changed
        from app.microspat.models.genotyping.project import GenotypingProject
        from app.microspat.models.quantification_bias_estimator.project import QuantificationBiasEstimatorProject
        from app.microspat.models.sample.control import Control
        # print("Bin Parameters Changed, notifying...")
        gp_projects = GenotypingProject.query.filter(GenotypingProject.bin_estimator_id == self.id).all()
        qbe_projects = QuantificationBiasEstimatorProject.query. \
            filter(QuantificationBiasEstimatorProject.bin_estimator_id == self.id).all()
        controls = Control.query.filter(Control.bin_estimator_id == self.id).all()
        for project in gp_projects:
            assert isinstance(project, GenotypingProject)
            project.bin_estimator_changed(locus_id)
        for project in qbe_projects:
            assert isinstance(project, QuantificationBiasEstimatorProject)
            project.bin_estimator_changed(locus_id)
        for control in controls:
            assert isinstance(control, Control)
            control.initialize_alleles()

    def filter_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def scanning_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def bin_estimator_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def samples_changed(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        lp.bin_estimator_parameters_stale = True
        self.parameters_changed(locus_id)

    def calculate_locus_bin_set(self, locus_id):
        locus = Locus.query.get(locus_id)
        if locus not in self.locus_set.loci:
            raise ValueError("{} is not a member of this project's analysis set.".format(locus.label))

        self.delete_locus_bin_set(locus_id)

        locus_parameters = self.get_locus_parameters(locus_id)

        socketio.sleep()
        annotations = ProjectChannelAnnotations.query.join(Channel).filter(
            ProjectChannelAnnotations.project_id == self.id).filter(Channel.locus_id == locus_id).all()

        socketio.sleep()
        peaks = []

        for a in annotations:
            if a.annotated_peaks:
                peaks += a.annotated_peaks

        if peaks:
            # assert isinstance(locus_parameters, BinEstimatorLocusParams)
            locus_bin_set = LocusBinSet.from_peaks(locus_id=locus_id, peaks=peaks,
                                                   min_peak_frequency=locus_parameters.min_peak_frequency,
                                                   bin_buffer=locus_parameters.default_bin_buffer)
            self.locus_bin_sets.append(locus_bin_set)
        self.parameters_changed(locus_id)
        return self

    def calculate_locus_bin_sets(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.calculate_locus_bin_set(locus.id)
        return self

    def delete_locus_bin_set(self, locus_id):
        LocusBinSet.query.filter(LocusBinSet.project_id == self.id).filter(LocusBinSet.locus_id == locus_id).delete()
        self.parameters_changed(locus_id)
        return self

    def create_locus_bin_set(self, locus_id):
        lbs = LocusBinSet()
        lbs.locus_id = locus_id
        self.locus_bin_sets.append(lbs)
        # db.session.flush()

    def annotate_bins(self, locus_id, peaks):
        lbs = self.get_locus_bin_set(locus_id)
        if peaks and lbs:
            peaks = lbs.annotate_bins(peaks)
        return peaks

    def get_locus_bin_set(self, locus_id):
        if not self._locus_bin_set.get(locus_id):
            self._locus_bin_set = {_.locus_id: _ for _ in self.locus_bin_sets}
        return self._locus_bin_set.get(locus_id, None)

    def analyze_locus(self, locus_id):
        super(BinEstimatorProject, self).analyze_locus(locus_id)
        locus_params = self.get_locus_parameters(locus_id)
        if locus_params.bin_estimator_parameters_stale:
            self.calculate_locus_bin_set(locus_id)
            locus_params.bin_estimator_parameters_stale = False
        return self

    def analyze_samples(self, locus_id):
        self.analyze_locus(locus_id)

    def serialize(self):
        res = super(BinEstimatorProject, self).serialize()
        res.update({
            'locus_bin_sets': {}
        })
        return res

    def serialize_details(self):
        res = super(BinEstimatorProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'locus_bin_sets': {locus_bin_set.locus_id: locus_bin_set.serialize() for locus_bin_set in
                               self.locus_bin_sets}
        })
        return res

    def get_alleles_dict(self, locus_id):
        lbs = self.get_locus_bin_set(locus_id)
        if lbs:
            return {x.id: False for x in lbs.bins}
        else:
            return {}
