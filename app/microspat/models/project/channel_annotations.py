from sqlalchemy.ext.mutable import MutableList

from app import db
from app.custom_sql_types.custom_types import CompressedJSONEncodedData
from ..attributes import TimeStamped, Flaggable
from app.microspat.peak_annotator.PeakFilters import compose_filters, peak_height_filter, bin_filter


class ProjectChannelAnnotations(TimeStamped, Flaggable, db.Model):
    """
    Channel level analysis in a project.
    """
    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channel.id", ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id", ondelete="CASCADE"), index=True)
    channel = db.relationship('Channel', lazy='select',
                              backref=db.backref("annotations"))
    annotated_peaks = db.Column(MutableList.as_mutable(CompressedJSONEncodedData), default=[])
    peak_indices = db.Column(MutableList.as_mutable(CompressedJSONEncodedData))
    __table_args__ = (
        db.UniqueConstraint('project_id', 'channel_id', name='_project_channel_uc'),
        {'sqlite_autoincrement': True}
    )

    def reinitialize(self):
        self.annotated_peaks = []
        self.peak_indices = []
        return self

    def serialize(self):
        res = {
            'id': self.id,
            'channel_id': self.channel_id,
            'project_id': self.project_id,
            'annotated_peaks': self.annotated_peaks or [],
            'last_updated': self.last_updated,
            'locus_id': self.channel.locus_id,
            'sample_id': self.channel.sample_id
        }
        return res


def select_best_run(channel_annotations, offscale_threshold):
    """
    Naive implementation to determine best run. Given more than one run, chooses run with largest peaks that does not
    have poor sizing quality, and if possible, peaks do not exceed offscale_threshold

    :param channel_annotations: ProjectChannelAnnotation[]
    :param offscale_threshold: int
    :return: ProjectChannelAnnotation
    """
    channel_annotations = channel_annotations or []
    channel_annotations = [x for x in channel_annotations if not x.get_flag('poor_sizing_quality')]

    best_annotation = None

    for annotation in channel_annotations:
        if not annotation.annotated_peaks:
            annotation.annotated_peaks = []
        assert isinstance(annotation, ProjectChannelAnnotations)

        peak_filter = compose_filters(peak_height_filter(max_height=offscale_threshold), bin_filter(in_bin=True))

        if not best_annotation:
            best_annotation = annotation
        else:

            best_peaks = peak_filter(best_annotation.annotated_peaks)
            curr_peaks = peak_filter(annotation.annotated_peaks)

            if best_peaks:
                max_best_peak = max(best_peaks, key=lambda _: _['peak_height'])
            else:
                max_best_peak = {'peak_height': 0}

            if curr_peaks:
                max_curr_peak = max(curr_peaks, key=lambda _: _['peak_height'])
            else:
                max_curr_peak = {'peak_height': 0}

            if max_curr_peak['peak_height'] > max_best_peak['peak_height']:
                best_annotation = annotation

    return best_annotation


def format_locus_annotations(all_locus_annotations, peak_filter=None):
    """
    Given a set of locus annotations, converts them to (locus_label, annotated_peaks) tuples, where the annotated peaks
    have had the optional peak_filter applied.

    :param all_locus_annotations: SampleLocusAnnotation[]
    :param peak_filter: function that returns peaks that satisfy condition
    :return:
    """
    if not peak_filter:
        def peak_filter(_):
            return _

    all_locus_annotations.sort(key=lambda _: _.locus.label)
    formatted_locus_annotations = []

    if isinstance(peak_filter, dict):
        for locus_annotation in all_locus_annotations:
            locus_label = locus_annotation.locus.label
            formatted_locus_annotations.append((locus_label, peak_filter[locus_label](locus_annotation.annotated_peaks)))

    else:
        for locus_annotation in all_locus_annotations:
            formatted_locus_annotations.append((locus_annotation.locus.label,
                                                peak_filter(locus_annotation.annotated_peaks)))

    return formatted_locus_annotations