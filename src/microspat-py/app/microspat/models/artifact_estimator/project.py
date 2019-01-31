from collections import defaultdict

from sqlalchemy.orm import reconstructor

from app import db

from app.microspat.models.project.sample_based_project import SampleBasedProject
from app.microspat.models.artifact_estimator.locus_params import ArtifactEstimatorLocusParams
from app.microspat.models.artifact_estimator.locus_artifact_estimator import LocusArtifactEstimator


class ArtifactEstimatorProject(SampleBasedProject):
    id = db.Column(db.Integer, db.ForeignKey('sample_based_project.id', ondelete="CASCADE"), primary_key=True)

    locus_artifact_estimators = db.relationship('LocusArtifactEstimator', lazy='dynamic',
                                                cascade='save-update, merge, delete, delete-orphan')
    locus_parameters = db.relationship('ArtifactEstimatorLocusParams', lazy='dynamic',
                                       backref=db.backref('artifact_estimator_project'),
                                       cascade="all, delete-orphan")

    __mapper_args__ = {'polymorphic_identity': 'artifact_estimator_project'}

    def __init__(self, **kwargs):
        super(ArtifactEstimatorProject, self).__init__(**kwargs)
        self._artifact_annotators = {}

    @reconstructor
    def init_on_load(self):
        super(ArtifactEstimatorProject, self).init_on_load()
        self._artifact_annotators = {}

    @classmethod
    def get_serialized_list(cls):
        projects = ArtifactEstimatorProject.query.values(cls.id, cls.title, cls.date, cls.creator, cls.description,
                                                         cls.locus_set_id, cls.last_updated)
        locus_parameters = ArtifactEstimatorLocusParams.query.values(ArtifactEstimatorLocusParams.id,
                                                                     ArtifactEstimatorLocusParams.project_id)

        locus_parameters_dict = defaultdict(list)
        print("Get Serialized List")
        for lp in locus_parameters:
            print(lp, type(lp))
            locus_parameters_dict[lp.project_id].append(lp.id)

        locus_artifact_estimators = LocusArtifactEstimator.query.values(LocusArtifactEstimator.id,
                                                                        LocusArtifactEstimator.project_id)

        locus_artifact_estimators_dict = defaultdict(list)
        for lae in locus_artifact_estimators:
            locus_artifact_estimators_dict[lae.project_id].append(lae.id)

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
                'locus_artifact_estimators': locus_artifact_estimators_dict[p[0]]
            }
            res.append(r)
        return res

    @classmethod
    def copy_project(cls, project):
        assert isinstance(project, cls)
        locus_artifact_estimators = project.locus_artifact_estimators
        locus_artifact_estimators = list(map(LocusArtifactEstimator.copy_locus_artifact_estimator, locus_artifact_estimators))

        project = super(ArtifactEstimatorProject, cls).copy_project(project)

        project.locus_artifact_estimators = locus_artifact_estimators
        db.session.flush()

        return project

    def annotate_channel(self, channel_annotation):
        pass

    def parameters_changed(self, locus_id):
        # TODO: Figure out a better way of notifying ArtifactEstimating projects that the artifact estimator has changed
        from app.microspat.models.genotyping.project import GenotypingProject
        from app.microspat.models.quantification_bias_estimator.project import QuantificationBiasEstimatorProject
        gp_projects = GenotypingProject.query.filter(GenotypingProject.artifact_estimator_id == self.id).all()
        qbe_projects = QuantificationBiasEstimatorProject.query.filter(
            QuantificationBiasEstimatorProject.artifact_estimator_id == self.id).all()
        for project in gp_projects:
            assert isinstance(project, GenotypingProject)
            project.artifact_estimator_changed(locus_id)
        for project in qbe_projects:
            assert isinstance(project, QuantificationBiasEstimatorProject)
            project.artifact_estimator_changed(locus_id)

    def filter_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def scanning_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def artifact_estimator_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def samples_changed(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        lp.artifact_estimator_parameters_stale = True
        self.parameters_changed(locus_id)

    # def add_channel(self, channel_id):
    #     channel_annotation = super(ArtifactEstimatorProject, self).add_channel(channel_id)
    #     return channel_annotation
    #
    # def add_channels(self, channel_ids):
    #     channel_annotations = []
    #
    #     for channel_id in channel_ids:
    #         channel_annotation = self.add_channel(channel_id)
    #         channel_annotations.append(channel_annotation)
    #
    #     return channel_annotations

    def delete_locus_artifact_estimator(self, locus_id):
        LocusArtifactEstimator.query.filter(LocusArtifactEstimator.project_id == self.id).filter(
            LocusArtifactEstimator.locus_id == locus_id).delete()
        self.parameters_changed(locus_id)
        return ArtifactEstimatorProject.query.get(self.id)

    def calculate_locus_artifact_estimator(self, locus_id):
        self.delete_locus_artifact_estimator(locus_id)
        self.parameters_changed(locus_id)

        annotations = []
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        locus_parameters = self.get_locus_parameters(locus_id)
        assert isinstance(locus_parameters, ArtifactEstimatorLocusParams)

        max_relative_peak_height = locus_parameters.max_secondary_relative_peak_height

        # Identify peak sets that contain a single primary peak, where a primary peak is a peak that exceeds the max
        # relative peak height. Use these peak sets to create a LocusArtifactEstimator
        for channel_annotation in channel_annotations:
            peaks = channel_annotation.annotated_peaks
            main_peak_count = 0
            secondary_peak_count = 0
            for peak in peaks:
                if peak['relative_peak_height'] < max_relative_peak_height:
                    secondary_peak_count += 1
                else:
                    main_peak_count += 1
            if main_peak_count == 1:
                annotations.append(peaks)
            # if peaks:
            #     main_peaks = []
            #     secondary_peaks = []
            #     for peak in peaks:
            #         if peak['relative_peak_height'] < max_relative_peak_height:
            #             secondary_peaks.append(peak)
            #         else:
            #             main_peaks.append(peak)
            #     if len(main_peaks) == 1 and main_peaks[0]['relative_peak_height'] == 1:
            #         if secondary_peaks:
            #             annotations.append(peaks)

        locus_artifact_estimator = None

        if annotations:
            locus_artifact_estimator = LocusArtifactEstimator.from_peaks(locus_id, annotations,
                                                                         locus_parameters.min_artifact_peak_frequency)
            db.session.add(locus_artifact_estimator)
            self.locus_artifact_estimators.append(locus_artifact_estimator)
        return locus_artifact_estimator

    def calculate_locus_artifact_estimators(self):
        loci = self.locus_set.loci
        for locus in loci:
            self.calculate_locus_artifact_estimator(locus.id)
        return self

    def get_artifact_annotator(self, locus_id):
        if not self._artifact_annotators.get(locus_id):
            self._artifact_annotators[locus_id] = self.locus_artifact_estimators \
                .filter(LocusArtifactEstimator.locus_id == locus_id).first()
        return self._artifact_annotators[locus_id]

    def annotate_artifact(self, locus_id, annotated_peaks):
        if annotated_peaks:
            for peak in annotated_peaks:
                peak['artifact_contribution'] = 0
                peak['artifact_error'] = 0
            artifact_annotator = self.get_artifact_annotator(locus_id)
            if artifact_annotator:
                assert isinstance(artifact_annotator, LocusArtifactEstimator)
                annotated_peaks = artifact_annotator.annotate_artifact(annotated_peaks)
        return annotated_peaks

    def analyze_locus(self, locus_id):
        super(ArtifactEstimatorProject, self).analyze_locus(locus_id)
        locus_parameters = self.get_locus_parameters(locus_id)
        if locus_parameters.artifact_estimator_parameters_stale:
            self.calculate_locus_artifact_estimator(locus_id)
            self.parameters_changed(locus_id)
            locus_parameters.artifact_estimator_parameters_stale = False
        return self

    def analyze_samples(self, locus_id):
        self.analyze_locus(locus_id)

    def serialize(self):
        res = super(ArtifactEstimatorProject, self).serialize()
        res.update({
            'locus_artifact_estimators': {}
        })
        return res

    def serialize_details(self):
        res = super(ArtifactEstimatorProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'locus_artifact_estimators': {locus_artifact_estimator.locus_id: locus_artifact_estimator.serialize() for
                                          locus_artifact_estimator in self.locus_artifact_estimators},
        })
        return res

    def export_to_json(self):
        pass
