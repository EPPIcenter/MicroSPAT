from collections import defaultdict
from itertools import groupby

from sqlalchemy.ext.declarative import declared_attr

from app import db, socketio
from ..ce.channel import Channel
from ..locus.locus import Locus
from ..locus.locus_set import LocusSet, locus_set_association_table
from ..sample.sample import Sample
from ..sample.sample_locus_annotation import SampleLocusAnnotation
from ..project.project import Project
from ..project.channel_annotations import ProjectChannelAnnotations
from ..project.sample_annotations import ProjectSampleAnnotations


class SampleBasedProject(Project):
    id = db.Column(db.Integer, db.ForeignKey('project.id', ondelete="CASCADE"), primary_key=True)
    __mapper_args__ = {'polymorphic_identity': 'sample_based_project'}

    @classmethod
    def copy_project(cls, project):
        assert isinstance(project, cls)

        reference_run_map = {}

        sample_annotations = project.sample_annotations.all()
        for sa in sample_annotations:
            assert isinstance(sa, ProjectSampleAnnotations)
            for la in sa.locus_annotations:
                la.old_ref_id = la.reference_run_id
                assert isinstance(la, SampleLocusAnnotation)
                reference_run_map[(sa.sample_id, la.locus_id)] = la.reference_run_id

        sample_annotations = map(ProjectSampleAnnotations.copy_project_sample_annotations, sample_annotations)

        project = super(SampleBasedProject, cls).copy_project(project)

        project.sample_annotations = sample_annotations

        old_ref_map = {}
        for ca in project.channel_annotations.all():
            old_ref_map[ca.old_id] = ca

        for sa in sample_annotations:
            assert isinstance(sa, ProjectSampleAnnotations)
            for la in sa.locus_annotations:
                assert isinstance(la, SampleLocusAnnotation)
                ref_run = reference_run_map[(sa.sample_id, la.locus_id)]
                if ref_run:
                    la.reference_run = old_ref_map[ref_run]
                la.project_id = project.id

        db.session.flush()

        return project

    @declared_attr
    def sample_annotations(self):
        return db.relationship('ProjectSampleAnnotations', backref=db.backref('project'), lazy='dynamic',
                               cascade='save-update, merge')

    @property
    def locus_parameters(self):
        raise NotImplementedError("Sample Based Project should not be directly initialized.")

    def scanning_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Sample Based Project should not be directly initialized")

    def filter_parameters_set_stale(self, locus_id):
        raise NotImplementedError("Sample Based Project should not be directly initialized")

    def valid_channel_ids(self, sample_id):
        channel_ids = Channel.query.join(Sample).join(Locus). \
            join(locus_set_association_table). \
            join(LocusSet). \
            join(Project). \
            filter(Project.id == self.id). \
            filter(Sample.id == sample_id). \
            values(Channel.id)
        return [_[0] for _ in channel_ids]

    def add_sample(self, sample_id):
        sample_annotation = ProjectSampleAnnotations(sample_id=sample_id)
        self.sample_annotations.append(sample_annotation)

        channel_ids = self.valid_channel_ids(sample_id)
        self.add_channels(channel_ids)

        for locus in self.locus_set.loci:
            socketio.sleep()
            locus_sample_annotation = SampleLocusAnnotation(locus_id=locus.id, project_id=self.id)
            sample_annotation.locus_annotations.append(locus_sample_annotation)
            self.set_locus_parameters_stale(locus.id)

        return sample_annotation

    def add_samples(self, sample_ids):
        present_sample_ids = set([_[0] for _ in self.sample_annotations.values(ProjectSampleAnnotations.id)])
        full_sample_ids = list(set(sample_ids) - present_sample_ids)

        sample_ids_map = defaultdict(list)
        channel_and_sample_ids = Channel.query.join(Sample).join(Locus).join(locus_set_association_table).join(
            LocusSet).join(
            Project).filter(Project.id == self.id).values(Channel.id, Channel.sample_id)
        for channel_id, sample_id in channel_and_sample_ids:
            sample_ids_map[sample_id].append(channel_id)

        n = 0
        while n * 100 < len(full_sample_ids) + 100:
            sample_ids = full_sample_ids[n * 100: (n + 1) * 100]
            channel_ids = []
            for sample_id in sample_ids:
                socketio.sleep()
                channel_ids += sample_ids_map[sample_id]

                sample_annotation = ProjectSampleAnnotations(sample_id=sample_id)
                db.session.add(sample_annotation)
                self.sample_annotations.append(sample_annotation)
                for locus in self.locus_set.loci:
                    locus_sample_annotation = SampleLocusAnnotation(locus_id=locus.id, project_id=self.id)
                    sample_annotation.locus_annotations.append(locus_sample_annotation)
            self.bulk_create_channel_annotations(channel_ids)
            db.session.flush()
            n += 1

        for locus in self.locus_set.loci:
            self.set_locus_parameters_stale(locus.id)

        return self

    def annotate_channel(self, channel_annotation):
        raise NotImplementedError()

    def recalculate_channel(self, channel_annotation, rescan_peaks):
        socketio.sleep()
        channel_annotation = super(SampleBasedProject, self).recalculate_channel(channel_annotation, rescan_peaks)
        self.annotate_channel(channel_annotation)
        return channel_annotation

    def recalculate_channels(self, channel_annotations, rescan_peaks):
        channel_annotations = super(SampleBasedProject, self).recalculate_channels(channel_annotations, rescan_peaks)

        for channel_annotation in channel_annotations:
            self.annotate_channel(channel_annotation)
        return channel_annotations

    def serialize(self):
        res = super(SampleBasedProject, self).serialize()
        res.update({
            'sample_annotations': []
        })
        return res

    def get_locus_sample_annotations(self, locus_id):
        """
        :param locus_id: int
        :return: list[SampleLocusAnnotation]
        """
        return SampleLocusAnnotation.query.filter(SampleLocusAnnotation.locus_id == locus_id) \
            .filter(SampleLocusAnnotation.project_id == self.id).all()

    def serialize_details(self):
        res = super(SampleBasedProject, self).serialize_details()
        sample_annotations = self.sample_annotations.all()
        res.update({
            'sample_annotations': [sample_annotation.serialize() for sample_annotation in sample_annotations]
        })
        return res

    def clear_sample_annotations(self, locus_id):
        sample_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).filter(
            SampleLocusAnnotation.locus_id == locus_id).filter(ProjectSampleAnnotations.project_id == self.id).all()
        for sample_annotation in sample_locus_annotations:
            socketio.sleep()
            assert isinstance(sample_annotation, SampleLocusAnnotation)
            sample_annotation.annotated_peaks = []
            sample_annotation.reference_run_id = None
            sample_annotation.clear_flags()
            sample_annotation.clear_alleles()
        return self

    def analyze_samples(self, locus_id):
        raise NotImplementedError("Sample Based Project should not be directly initialized")

    def get_runs(self, locus_id):
        channel_annotations = self.channel_annotations.join(Channel).filter(Channel.locus_id == locus_id).all()
        channel_annotations.sort(key=lambda x: x.channel.sample_id)
        runs = {}

        for sample_id, ca in groupby(channel_annotations, key=lambda x: x.channel.sample_id):
            runs[sample_id] = list(ca)

        return runs

    @staticmethod
    def select_best_run(channel_annotations, offscale_threshold):
        channel_annotations = [x for x in channel_annotations if not x.get_flag('poor_sizing_quality')]
        best_annotation = None
        for annotation in channel_annotations:
            socketio.sleep()
            if not annotation.annotated_peaks:
                annotation.annotated_peaks = []
            assert isinstance(annotation, ProjectChannelAnnotations)
            if not best_annotation:
                best_annotation = annotation
            else:
                best_peaks = filter(lambda y: y['peak_height'] < offscale_threshold and y.get('in_bin', True),
                                    best_annotation.annotated_peaks)

                if best_peaks:
                    max_best_peak = max(best_peaks, key=lambda x: x['peak_height'])
                else:
                    max_best_peak = {'peak_height': 0}

                curr_peaks = filter(lambda y: y['peak_height'] < offscale_threshold and y.get('in_bin', True),
                                    annotation.annotated_peaks)

                if curr_peaks:
                    max_curr_peak = max(curr_peaks, key=lambda x: x['peak_height'])
                else:
                    max_curr_peak = {'peak_height': 0}

                if max_curr_peak['peak_height'] > max_best_peak['peak_height']:
                    best_annotation = annotation
        return best_annotation