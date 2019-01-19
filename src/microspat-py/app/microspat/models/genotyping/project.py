from collections import defaultdict

from app import db, socketio
from app.utils import subset

from app.microspat.models.artifact_estimator.artifact_estimating import ArtifactEstimating
from app.microspat.models.bin_estimator.bin import Bin
from app.microspat.models.bin_estimator.bin_estimating import BinEstimating
from app.microspat.models.bin_estimator.locus_bin_set import LocusBinSet
from app.microspat.models.bin_estimator.project import BinEstimatorProject
from app.microspat.models.ce.channel import Channel
from app.microspat.models.genotyping.locus_params import GenotypingLocusParams
from app.microspat.models.locus.locus import Locus
from app.microspat.models.locus.locus_set import LocusSet, locus_set_association_table
from app.microspat.models.project.channel_annotations import ProjectChannelAnnotations, format_locus_annotations
from app.microspat.models.project.project import Project
from app.microspat.models.project.sample_annotations import ProjectSampleAnnotations
from app.microspat.models.project.sample_based_project import SampleBasedProject
from app.microspat.models.sample.genotype import Genotype
from app.microspat.models.sample.sample import Sample
from app.microspat.models.sample.sample_locus_annotation import SampleLocusAnnotation
from app.microspat.models.quantification_bias_estimator.quantification_bias_estimating import (
    QuantificationBiasEstimating
)

from app.microspat.peak_annotator.PeakFilters import (
    compose_filters, bin_filter, flags_filter, probability_filter
)

from app.microspat.statistics import (
    calculate_allele_frequencies, calculate_moi, calculate_prob_negative, calculate_prob_pos_if_observed
)


class GenotypingProject(SampleBasedProject, ArtifactEstimating, QuantificationBiasEstimating, BinEstimating):
    # Collection of methods to annotate peaks with artifact, bin in which a peak falls, probabilistic estimate of peak
    id = db.Column(db.Integer, db.ForeignKey('sample_based_project.id', ondelete="CASCADE"), primary_key=True)
    locus_parameters = db.relationship('GenotypingLocusParams', backref=db.backref('genotyping_project'),
                                       lazy='dynamic', cascade="all, delete-orphan")

    __mapper_args__ = {'polymorphic_identity': 'genotyping_project'}

    def __init__(self, locus_set_id, bin_estimator_id, **kwargs):
        super(GenotypingProject, self).__init__(locus_set_id, **kwargs)
        self.bin_estimator_id = bin_estimator_id
        self.artifact_estimator_id = kwargs.get('artifact_estimator_id', None)

    def bin_estimator_changed(self, locus_id):
        super(GenotypingProject, self).bin_estimator_changed(locus_id)
        glp = self.get_locus_parameters(locus_id)
        glp.genotyping_parameters_stale = True
        self.initialize_alleles(locus_id)

    def artifact_estimator_changed(self, locus_id):
        super(GenotypingProject, self).artifact_estimator_changed(locus_id)
        glp = self.get_locus_parameters(locus_id)
        glp.genotyping_parameters_stale = True
        self.initialize_alleles(locus_id)

    def samples_changed(self, locus_id):
        pass

    def quantification_bias_estimator_changed(self, locus_id):
        super(GenotypingProject, self).quantification_bias_estimator_changed(locus_id)
        self.clear_locus_quantification_bias_annotations(locus_id)
        locus_annotations = self.get_locus_sample_annotations(locus_id)
        for locus_annotation in locus_annotations:
            self.recalculate_alleles(locus_annotation)
        return self

    def filter_parameters_set_stale(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        self.clear_sample_annotations(locus_id)
        for c in channel_annotations:
            assert isinstance(c, ProjectChannelAnnotations)
            c.annotated_peaks = []
            c.clear_flags()
        return self

    def scanning_parameters_set_stale(self, locus_id):
        channel_annotations = self.get_locus_channel_annotations(locus_id)
        for c in channel_annotations:
            assert isinstance(c, ProjectChannelAnnotations)
            c.peak_indices = []
        return self

    def annotate_channel(self, channel_annotation):
        assert isinstance(channel_annotation, ProjectChannelAnnotations)
        # super(GenotypingProject, self).annotate_channel(channel_annotation)
        if channel_annotation.annotated_peaks:
            if self.bin_estimator:
                self.annotate_bins([channel_annotation])

            if self.artifact_estimator:
                self.annotate_artifact([channel_annotation])

    def add_channel(self, channel_id):
        channel_annotation = ProjectChannelAnnotations.query.filter(
            ProjectChannelAnnotations.channel_id == channel_id).filter(
            ProjectChannelAnnotations.project_id == self.id).first()

        if not channel_annotation:
            channel_annotation = super(GenotypingProject, self).add_channel(channel_id)

        return channel_annotation

    def add_sample(self, sample_id):
        sample_annotation = ProjectSampleAnnotations(sample_id=sample_id)
        self.sample_annotations.append(sample_annotation)

        channel_ids = self.valid_channel_ids(sample_id)
        self.add_channels(channel_ids)

        for locus in self.locus_set.loci:
            locus_annotation = Genotype(locus_id=locus.id, project_id=self.id)
            bin_ids = Bin.query.join(LocusBinSet).join(BinEstimatorProject).filter(
                BinEstimatorProject.id == self.bin_estimator_id).filter(LocusBinSet.locus_id == locus.id).values(Bin.id)
            locus_annotation.alleles = dict([(str(bin_id[0]), False) for bin_id in bin_ids])
            sample_annotation.locus_annotations.append(locus_annotation)
            self.set_locus_parameters_stale(locus.id)

        return sample_annotation

    def add_samples(self, sample_ids):
        present_sample_ids = set([_[0] for _ in self.sample_annotations.values(ProjectSampleAnnotations.id)])
        full_sample_ids = list(set(sample_ids) - present_sample_ids)

        # Cache all channel IDs available
        sample_ids_map = defaultdict(list)
        channel_and_sample_ids = Channel.query.join(Sample).join(Locus).join(locus_set_association_table).join(
            LocusSet).join(
            Project).filter(Project.id == self.id).values(Channel.id, Channel.sample_id)
        for channel_id, sample_id in channel_and_sample_ids:
            sample_ids_map[sample_id].append(channel_id)

        # Cache all bin IDs
        bins_map = defaultdict(list)
        bin_and_locus_ids = Bin.query.join(LocusBinSet).join(BinEstimatorProject).filter(
            BinEstimatorProject.id == self.bin_estimator_id).values(Bin.id, LocusBinSet.locus_id)
        for bin_id, locus_id in bin_and_locus_ids:
            bins_map[locus_id].append(bin_id)

        n = 0

        for sample_ids in subset(full_sample_ids, 100):
            channel_ids = []
            for sample_id in sample_ids:
                socketio.sleep()
                channel_ids += sample_ids_map[sample_id]
                sample_annotation = ProjectSampleAnnotations(sample_id=sample_id, project_id=self.id)
                db.session.add(sample_annotation)
                self.sample_annotations.append(sample_annotation)
                for locus in self.locus_set.loci:
                    locus_annotation = Genotype(locus_id=locus.id, project_id=self.id)
                    bin_ids = bins_map[locus.id]
                    locus_annotation.alleles = dict([(str(bin_id), False) for bin_id in bin_ids])
                    sample_annotation.locus_annotations.append(locus_annotation)
            self.bulk_create_channel_annotations(channel_ids)
            db.session.flush()
            n += 1

        for locus in self.locus_set.loci:
            self.set_locus_parameters_stale(locus.id)

        return self

    def analyze_locus(self, locus_id):
        psas = ProjectSampleAnnotations.query.filter(ProjectSampleAnnotations.project_id == self.id).all()
        for psa in psas:
            psa.moi = None
        # db.session.flush()

        locus_params = self.get_locus_parameters(locus_id)
        if locus_params.scanning_parameters_stale or locus_params.filter_parameters_stale:
            locus_params.genotyping_parameters_stale = True

        super(SampleBasedProject, self).analyze_locus(locus_id)

        if locus_params.genotyping_parameters_stale:
            self.analyze_samples(locus_id)
            locus_params.genotyping_parameters_stale = False

        return self

    def analyze_samples(self, locus_id):
        self.clear_sample_annotations(locus_id)
        self.initialize_alleles(locus_id)
        locus_params = self.get_locus_parameters(locus_id)
        assert isinstance(locus_params, GenotypingLocusParams)
        locus_annotations = self.get_locus_sample_annotations(locus_id)
        all_runs = self.get_runs(locus_id)
        for locus_annotation in locus_annotations:
            socketio.sleep()
            try:
                locus_annotation.alleles.pop('None')
                locus_annotation.alleles.changed()
            except KeyError:
                pass

            locus_annotation.set_flag('manual_curation', False)

            assert isinstance(locus_annotation, SampleLocusAnnotation)

            runs = all_runs.get(locus_annotation.sample_annotation.sample_id, [])

            if runs:
                channel_annotation = self.select_best_run(all_runs[locus_annotation.sample_annotation.sample_id],
                                                          locus_params.offscale_threshold)
            else:
                channel_annotation = None

            if channel_annotation:
                locus_annotation.reference_run = channel_annotation
                peaks = channel_annotation.annotated_peaks[:]

                peaks = [self.flag_peak(_, locus_params) for _ in peaks]

                locus_annotation.annotated_peaks = peaks
                locus_annotation.set_flag('failure', True)
                locus_annotation.set_flag('offscale', False)
                for peak in locus_annotation.annotated_peaks:
                    if peak['peak_height'] > locus_params.failure_threshold:
                        locus_annotation.set_flag('failure', False)

                    if (
                        peak['peak_height'] > locus_params.offscale_threshold or
                        peak['peak_height'] * peak['bleedthrough_ratio'] > locus_params.offscale_threshold or
                        peak['peak_height'] * peak['crosstalk_ratio'] > locus_params.offscale_threshold
                    ):
                        locus_annotation.set_flag('offscale', True)

                if not locus_annotation.get_flag('failure'):
                    for peak in locus_annotation.annotated_peaks:
                        if peak['bin_id'] == 'None':
                            peak['bin_id'] = None
                            peak['bin'] = None
                            peak['in_bin'] = False
                        if not any(peak['flags'].values()) and peak['bin_id'] and peak['bin_id'] != 'None':
                            locus_annotation.alleles[str(peak['bin_id'])] = True
            else:
                locus_annotation.reference_run = None
                locus_annotation.annotated_peaks = []
        return self

    @staticmethod
    def flag_peak(peak, locus_params):
        """
        :type peak: dict
        :type locus_params: GenotypingLocusParams
        """
        peak['flags'] = {
            'below_relative_threshold': False,
            'bleedthrough': False,
            'crosstalk': False,
            'artifact': False,
        }
        if peak['relative_peak_height'] < locus_params.relative_peak_height_limit:
            peak['flags']['below_relative_threshold'] = True

        adjusted_peak_height = peak['peak_height'] - peak.get('artifact_contribution', 0) - (
            peak.get('artifact_error', 0) * locus_params.hard_artifact_sd_limit)

        if adjusted_peak_height < locus_params.absolute_peak_height_limit:
            peak['flags']['artifact'] = True

        if peak['bleedthrough_ratio'] > locus_params.bleedthrough_filter_limit or peak['peak_height'] * \
                peak['bleedthrough_ratio'] > locus_params.offscale_threshold:
            peak['flags']['bleedthrough'] = True

        if peak['crosstalk_ratio'] > locus_params.crosstalk_filter_limit or peak['peak_height'] * \
                peak['crosstalk_ratio'] > locus_params.offscale_threshold:
            peak['flags']['crosstalk'] = True

        return peak

    def estimate_allele_frequencies(self):

        peak_filters = {}
        for lp in self.locus_parameters:
            peak_filters[lp.locus.label] = compose_filters(bin_filter(in_bin=True), flags_filter(),
                                                           probability_filter(lp.bootstrap_probability_threshold))

        all_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).join(Sample).filter(
            Sample.designation == 'sample').filter(SampleLocusAnnotation.project_id == self.id).all()

        all_locus_annotations = [_ for _ in all_locus_annotations if not _.get_flag('failure')]

        locus_annotation_dict = defaultdict(list)
        for annotation in all_locus_annotations:
            locus_annotation_dict[annotation.sample_annotations_id].append(annotation)

        self.initialize_probability_annotations(all_locus_annotations)
        sample_annotations = self.sample_annotations.join(Sample).filter(Sample.designation == 'sample').all()

        alleles_changed = True
        cycles = 0
        allele_frequencies = {}
        while alleles_changed:

            cycles += 1
            alleles_changed = False
            allele_frequency_locus_annotations = format_locus_annotations(all_locus_annotations, peak_filters)
            allele_frequencies = calculate_allele_frequencies(allele_frequency_locus_annotations)

            for sample_annotation in sample_annotations:
                assert isinstance(sample_annotation, ProjectSampleAnnotations)
                locus_annotations = locus_annotation_dict[sample_annotation.id]

                formatted_locus_annotations = format_locus_annotations(locus_annotations, peak_filters)
                moi = calculate_moi(formatted_locus_annotations, offset=1)

                for locus_annotation in locus_annotations:
                    socketio.sleep()
                    lp = self.get_locus_parameters(locus_annotation.locus_id)
                    assert isinstance(lp, GenotypingLocusParams)
                    if len(locus_annotation.annotated_peaks) > 0 and not locus_annotation.get_flag('failure'):
                        all_peaks = locus_annotation.annotated_peaks[:]
                        possible_peaks = peak_filters[lp.locus.label](all_peaks)
                        possible_peaks = calculate_prob_negative(possible_peaks, moi,
                                                                 allele_frequencies[locus_annotation.locus.label])
                        prob_annotated_possible_peaks = calculate_prob_pos_if_observed(possible_peaks)
                        recalculated_peak_probabilities = {p['peak_index']: p['probability'] for p in
                                                           prob_annotated_possible_peaks}

                        for peak in locus_annotation.annotated_peaks:
                            socketio.sleep()
                            if peak['peak_index'] in recalculated_peak_probabilities:
                                peak['probability'] = recalculated_peak_probabilities[peak['peak_index']]
                                if peak['probability'] < lp.bootstrap_probability_threshold:
                                    alleles_changed = True

        self.initialize_probability_annotations(all_locus_annotations)
        return allele_frequencies

    def estimate_moi(self, allele_frequencies, offset=1):

        peak_filters = {}
        for lp in self.locus_parameters:
            peak_filters[lp.locus.label] = compose_filters(bin_filter(in_bin=True), flags_filter(),
                                                           probability_filter(lp.bootstrap_probability_threshold))

        all_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).join(Sample).filter(
            Sample.designation == 'sample').filter(SampleLocusAnnotation.project_id == self.id).all()

        all_locus_annotations = [_ for _ in all_locus_annotations if not _.get_flag('failure')]

        locus_annotation_dict = defaultdict(list)
        for annotation in all_locus_annotations:
            locus_annotation_dict[annotation.sample_annotations_id].append(annotation)

        self.initialize_probability_annotations(all_locus_annotations)
        sample_annotations = self.sample_annotations.join(Sample).filter(Sample.designation == 'sample').all()

        moi_dict = defaultdict(int)

        for sample_annotation in sample_annotations:
            assert isinstance(sample_annotation, ProjectSampleAnnotations)
            locus_annotations = locus_annotation_dict[sample_annotation.id]
            moi_changed = True
            cycles = 0
            while moi_changed:
                cycles += 1
                formatted_locus_annotations = format_locus_annotations(locus_annotations, peak_filters)
                moi = calculate_moi(formatted_locus_annotations, offset=offset)

                if moi_dict[sample_annotation.id] != moi:
                    moi_changed = True
                    moi_dict[sample_annotation.id] = moi
                else:
                    break

                for locus_annotation in locus_annotations:
                    socketio.sleep()
                    lp = self.get_locus_parameters(locus_annotation.locus_id)
                    assert isinstance(lp, GenotypingLocusParams)
                    if len(locus_annotation.annotated_peaks) > 0 and not locus_annotation.get_flag('failure'):
                        all_peaks = locus_annotation.annotated_peaks[:]
                        possible_peaks = peak_filters[lp.locus.label](all_peaks)
                        possible_peaks = calculate_prob_negative(possible_peaks, moi_dict[sample_annotation.id],
                                                                 allele_frequencies[locus_annotation.locus.label])
                        prob_annotated_possible_peaks = calculate_prob_pos_if_observed(possible_peaks)
                        recalculated_peak_probabilities = {p['peak_index']: p['probability'] for p in
                                                           prob_annotated_possible_peaks}

                        for peak in locus_annotation.annotated_peaks:
                            socketio.sleep()
                            if peak['peak_index'] in recalculated_peak_probabilities:
                                peak['probability'] = recalculated_peak_probabilities[peak['peak_index']]
        self.initialize_probability_annotations(all_locus_annotations)

        return moi_dict

    def annotate_peak_probability(self, allele_frequencies=None, fixed_moi=None):

        if not allele_frequencies:
            allele_frequencies = self.estimate_allele_frequencies()

        if not fixed_moi:
            moi_dict = self.estimate_moi(allele_frequencies)

        all_locus_annotations = SampleLocusAnnotation.query.join(ProjectSampleAnnotations).join(Sample).filter(
            Sample.designation == 'sample').filter(SampleLocusAnnotation.project_id == self.id).all()

        all_locus_annotations = [_ for _ in all_locus_annotations if not _.get_flag('failure')]

        locus_annotation_dict = defaultdict(list)
        for annotation in all_locus_annotations:
            socketio.sleep()
            locus_annotation_dict[annotation.sample_annotations_id].append(annotation)

        sample_annotations = self.sample_annotations.join(Sample).filter(Sample.designation == 'sample').all()

        for sample_annotation in sample_annotations:
            socketio.sleep()
            assert isinstance(sample_annotation, ProjectSampleAnnotations)
            if not fixed_moi:
                sample_annotation.moi = moi_dict[sample_annotation.id]
            else:
                sample_annotation.moi = fixed_moi
            locus_annotations = locus_annotation_dict[sample_annotation.id]

            for locus_annotation in locus_annotations:
                for peak in locus_annotation.annotated_peaks:
                    peak['probability'] = 1.0
                if len(locus_annotation.annotated_peaks) > 0 and not locus_annotation.get_flag('failure'):
                    locus_annotation.annotated_peaks = calculate_prob_negative(locus_annotation.annotated_peaks,
                                                                               sample_annotation.moi,
                                                                               allele_frequencies[
                                                                                   locus_annotation.locus.label
                                                                               ])
                    locus_annotation.annotated_peaks = calculate_prob_pos_if_observed(locus_annotation.annotated_peaks)

                    for peak in locus_annotation.annotated_peaks:
                        if peak['flags']['bleedthrough'] or peak['flags']['crosstalk']:
                            peak['probability'] = 0

                    locus_annotation.annotated_peaks.changed()

                    self.recalculate_alleles(locus_annotation)
        return self

    def recalculate_alleles(self, locus_annotation):
        locus_param = self.get_locus_parameters(locus_annotation.locus_id)
        assert isinstance(locus_param, GenotypingLocusParams)
        true_peaks = []
        locus_annotation.alleles = dict.fromkeys(locus_annotation.alleles, False)
        locus_annotation.set_flag('manual_curation', False)
        if locus_annotation.annotated_peaks and not locus_annotation.get_flag('failure'):
            for peak in locus_annotation.annotated_peaks:
                socketio.sleep()
                if not any(peak['flags'].values()) and peak['bin_id']:
                    if peak['probability'] >= locus_param.probability_threshold or (
                                (peak['peak_height'] - peak['artifact_contribution']) /
                                max(peak['artifact_error'], 1)) > locus_param.soft_artifact_sd_limit:
                        locus_annotation.alleles[str(peak['bin_id'])] = True
                        true_peaks.append(peak)
            if self.quantification_bias_estimator:
                self.annotate_quantification_bias([locus_annotation])
        locus_annotation.alleles.changed()

    #
    # def calculate_moi(self, locus_annotations, offset=0):
    #     """
    #     Calculate MOI by returning the largest number of alleles
    #     :param locus_annotations:
    #     :return:
    #     """
    #     peak_filter = compose_filters(bin_filter(in_bin=True), flags_filter(), self.probability_filter)
    #     peak_counts = []
    #     for locus_annotation in locus_annotations:
    #         locus_params = self.get_locus_parameters(locus_annotation.locus_id)
    #         f = compose_filters(peak_filter, artifact_filter(locus_params.absolute_peak_height_limit,
    #                                                          locus_params.hard_artifact_sd_limit))
    #
    #         # peaks =
    #         if locus_annotation.annotated_peaks and not locus_annotation.get_flag('failure'):
    #             peak_counts.append(len([x for x in locus_annotation.annotated_peaks if
    #                                     x['probability'] >= self.probability_threshold]))
    #         else:
    #             peak_counts.append(0)
    #     peak_counts.sort()
    #     # if len(peak_counts) > 2:
    #     #     moi = peak_counts[-2]
    #     # else:
    #     #     moi = 0
    #     if len(peak_counts) > 0:
    #         moi = peak_counts[-1]
    #     else:
    #         moi = 0
    #     return moi

    @staticmethod
    def initialize_probability_annotations(locus_annotations):
        for locus_annotation in locus_annotations:
            if locus_annotation.annotated_peaks:
                for peak in locus_annotation.annotated_peaks:
                    if peak.get('in_bin') and not any(peak['flags'].values()):
                        peak['probability'] = 1
                    else:
                        peak['probability'] = 0
                locus_annotation.annotated_peaks.changed()

    def serialize(self):
        res = super(GenotypingProject, self).serialize()
        res.update({
            'artifact_estimator_id': self.artifact_estimator_id,
        })
        return res

    def serialize_details(self):
        res = super(GenotypingProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'artifact_estimator_id': self.artifact_estimator_id,
            'sample_annotations': {x.id: x.serialize() for x in self.sample_annotations.all()}
        })
        return res
