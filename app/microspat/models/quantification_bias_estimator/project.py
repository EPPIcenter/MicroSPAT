import eventlet
from sqlalchemy.orm.exc import NoResultFound

from app import db
from ..sample.exceptions import ControlException
from app.microspat.quantification_bias.BiasCalculator import correct_peak_proportion, calculate_beta
from ..project.sample_annotations import ProjectSampleAnnotations
from ..sample.control_sample_association import ControlSampleAssociation
from ..sample.sample_locus_annotation import SampleLocusAnnotation
from ..sample.control import Control
from ..sample.sample import Sample
from ..artifact_estimator.artifact_estimating import ArtifactEstimating
from ..bin_estimator.bin_estimating import BinEstimating
from ..project.channel_annotations import ProjectChannelAnnotations
from ..project.sample_based_project import SampleBasedProject
from app.utils import CaseInsensitiveDictReader
from ..quantification_bias_estimator.locus_params import QuantificationBiasEstimatorLocusParams
from ..quantification_bias_estimator.exceptions import BadProportions


class QuantificationBiasEstimatorProject(SampleBasedProject, ArtifactEstimating, BinEstimating):
    id = db.Column(db.Integer, db.ForeignKey('sample_based_project.id', ondelete="CASCADE"), primary_key=True)
    locus_parameters = db.relationship('QuantificationBiasEstimatorLocusParams',
                                       backref=db.backref('quantification_bias_estimator_project'),
                                       lazy='dynamic', cascade='save-update, merge, delete, delete-orphan')

    __mapper_args__ = {'polymorphic_identity': 'quantification_bias_estimator_project'}

    def artifact_estimator_changed(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        lp.set_filter_parameters_stale()
        return self

    def bin_estimator_changed(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        lp.set_filter_parameters_stale()
        return self

    def filter_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def scanning_parameters_set_stale(self, locus_id):
        self.parameters_changed(locus_id)

    def parameters_changed(self, locus_id):
        from ..genotyping.project import GenotypingProject
        projects = GenotypingProject.query.filter(GenotypingProject.bin_estimator_id == self.id).all()
        for project in projects:
            assert isinstance(project, GenotypingProject)
            project.quantification_bias_estimator_changed(locus_id)

    def annotate_quantification_bias(self, locus_id, peak_set):
        peak_set = correct_peak_proportion(self.get_beta(locus_id), peak_set)
        return peak_set

    def assign_controls(self, sample_annotation_id, controls):
        """
        :type sample_annotation_id: int
        :type controls: list[(int, float)]
        :return:
        """
        sample_annotation = ProjectSampleAnnotations.query.get(sample_annotation_id)
        assert isinstance(sample_annotation, ProjectSampleAnnotations)
        if sample_annotation.project_id != self.id:
            raise BadProportions("Sample is not a member of this project.")

        if abs(sum([_[1] for _ in controls]) - 1) > .00001:
            raise BadProportions("Sum of control proportions does not add to 1.")

        temp = []
        for control in controls:
            c = Control.query.get(control[0])
            if c.bin_estimator_id != self.bin_estimator_id:
                raise BadProportions("Control Bin Estimator Does Not Match Project Bin Estimator")
            temp += [(c, control[1])]
        controls = temp

        ControlSampleAssociation.query.filter(
            ControlSampleAssociation.sample_annotation_id == sample_annotation_id).delete()

        for control in controls:
            c, prop = control
            new_control_association = ControlSampleAssociation(control_id=c.id,
                                                               sample_annotation_id=sample_annotation_id,
                                                               proportion=prop)
            db.session.add(new_control_association)

        return self

    def get_beta(self, locus_id):
        return self.get_locus_parameters(locus_id).beta

    def calculate_beta(self, locus_id):
        lp = self.get_locus_parameters(locus_id)
        assert isinstance(lp, QuantificationBiasEstimatorLocusParams)
        if lp:
            locus_annotations = self.get_locus_sample_annotations(locus_id)
            peak_sets = [filter(lambda _: _['true_proportion'] > lp.min_bias_quantifier_peak_proportion and
                                          _['peak_height'] > lp.min_bias_quantifier_peak_height,
                                locus_annotation.annotated_peaks) for locus_annotation in locus_annotations]
            peak_sets = [_ for _ in peak_sets if
                         abs(sum([peak['true_proportion'] for peak in _]) - 1) < .0001 and len(_) > 1]
            if peak_sets:
                lp.beta, lp.sd, lp.r_squared = calculate_beta(peak_sets,
                                                              min_peak_proportion=lp.min_bias_quantifier_peak_proportion)
            else:
                lp.beta = None
        return self

    def update_true_proportion(self, locus_annotation_id, peaks):
        locus_annotation = SampleLocusAnnotation.query.filter(SampleLocusAnnotation.id == locus_annotation_id,
                                                              SampleLocusAnnotation.project_id == self.id).first()
        if locus_annotation:
            while peaks:
                updated_peak = peaks.pop()
                for peak in locus_annotation.annotated_peaks:
                    if peak['index'] == updated_peak['index']:
                        peak.update(updated_peak)
        locus_annotation.annotated_peaks.changed()
        return self

    def analyze_locus(self, locus_id):
        locus_params = self.get_locus_parameters(locus_id)
        assert isinstance(locus_params, QuantificationBiasEstimatorLocusParams)
        if locus_params.scanning_parameters_stale or locus_params.filter_parameters_stale:
            locus_params.quantification_bias_parameters_stale = True

        super(QuantificationBiasEstimatorProject, self).analyze_locus(locus_id)

        if locus_params.quantification_bias_parameters_stale:
            self.analyze_samples(locus_id)
            locus_params.quantification_bias_parameters_stale = False

        self.calculate_beta(locus_id)
        self.analyze_samples(locus_id)
        return self

    def annotate_channel(self, channel_annotation):
        assert isinstance(channel_annotation, ProjectChannelAnnotations)
        # super(QuantificationBiasEstimatorProject, self).annotate_channel(channel_annotation)

        if channel_annotation.annotated_peaks:
            if self.bin_estimator:
                self.annotate_bins([channel_annotation])

            if self.artifact_estimator:
                self.annotate_artifact([channel_annotation])

    def analyze_samples(self, locus_id):
        self.clear_sample_annotations(locus_id)
        locus_params = self.get_locus_parameters(locus_id)
        assert isinstance(locus_params, QuantificationBiasEstimatorLocusParams)

        locus_annotations = self.get_locus_sample_annotations(locus_id)
        all_runs = self.get_runs(locus_id)

        for locus_annotation in locus_annotations:
            eventlet.sleep()
            try:
                locus_annotation.alleles.pop('None')
            except KeyError:
                pass

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

                for peak in peaks:
                    peak.update({'true_proportion': 0})

                controls_and_props = ControlSampleAssociation.query.filter(
                    ControlSampleAssociation.sample_annotation_id == locus_annotation.sample_annotations_id).values(
                    ControlSampleAssociation.control_id, ControlSampleAssociation.proportion)

                true_peak_indices = set()
                true_peaks = []

                for control_id, proportion in controls_and_props:

                    control = Control.query.get(control_id)
                    assert isinstance(control, Control)
                    if control.alleles[str(locus_annotation.locus_id)]:
                        bin_id = str(control.alleles[str(locus_annotation.locus_id)])
                        control_peaks = [_ for _ in peaks if str(_['bin_id']) == bin_id]
                        if control_peaks:
                            true_peak = max(control_peaks, key=lambda _: _.get('peak_height'))
                            true_peak['true_proportion'] += proportion
                            if true_peak['peak_index'] not in true_peak_indices:
                                true_peaks.append(true_peak)
                                true_peak_indices.add(true_peak['peak_index'])

                        locus_annotation.alleles[bin_id] = True

                self.annotate_quantification_bias(locus_annotation.locus_id, true_peaks)

                locus_annotation.annotated_peaks = true_peaks
            else:
                locus_annotation.reference_run = None
                locus_annotation.annotated_peaks = []
                locus_annotation.alleles = dict.fromkeys(self.bin_estimator.get_alleles_dict(locus_id), False)
                locus_annotation.set_flag('manual_curation', False)
        return self

    def serialize(self):
        res = super(QuantificationBiasEstimatorProject, self).serialize()
        return res

    def serialize_details(self):
        res = super(QuantificationBiasEstimatorProject, self).serialize_details()
        res.update({
            'locus_parameters': {_.locus_id: _.serialize() for _ in self.locus_parameters.all()},
            'sample_annotations': {x.id: x.serialize() for x in self.sample_annotations.all()}
        })
        return res


def load_samples_and_controls_from_csv(f, qbe_proj_id):
    r = CaseInsensitiveDictReader(f)
    qbe = QuantificationBiasEstimatorProject.query.get(qbe_proj_id)
    control_map = {}
    assert isinstance(qbe, QuantificationBiasEstimatorProject)
    for d in r:
        barcode = d.pop('barcode')
        sample_id = Sample.query.filter(Sample.barcode == barcode).value(Sample.id)
        if not barcode:
            raise ControlException("Barcode header missing.")
        controls_and_props = d.values()
        controls_and_props = map(lambda _: _.strip().split(';'), controls_and_props)
        controls = []
        for control_and_prop in controls_and_props:
            if len(control_and_prop) > 1:
                control, prop = control_and_prop
                try:
                    prop = float(prop)
                except ValueError:
                    raise ControlException("Control entry malformed.")
                try:
                    c = Control.query.filter(Control.barcode == control).filter(
                        Control.bin_estimator_id == qbe.bin_estimator_id).one()
                except NoResultFound:
                    raise ControlException("Control \"{}\" malformed or bin estimator does not match.".format(control))
                assert isinstance(c, Control)
                controls.append((c.id, prop))
        if controls:
            control_map[sample_id] = controls
    sample_ids = control_map.keys()
    qbe.add_samples(sample_ids)
    db.session.flush()
    sample_annotation_ids = qbe.sample_annotations.values(ProjectSampleAnnotations.id,
                                                          ProjectSampleAnnotations.sample_id)
    for sa_id, sample_id in sample_annotation_ids:
        qbe.assign_controls(sa_id, control_map[sample_id])