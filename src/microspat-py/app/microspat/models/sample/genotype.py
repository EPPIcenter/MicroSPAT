from flask_sqlalchemy import SignallingSession

from sqlalchemy import event
from sqlalchemy.ext.mutable import MutableDict

from app import db

from app.custom_sql_types.custom_types import CompressedJSONEncodedData

from app.microspat.models.sample.sample_locus_annotation import SampleLocusAnnotation
from app.microspat.models.project.channel_annotations import ProjectChannelAnnotations
from app.microspat.models.project.project import Project
from app.microspat.models.ce.channel import Channel


@event.listens_for(SignallingSession, 'before_flush')
def clear_channel_annotations(session, _, __):
    channel_annotation_ids = [_.id for _ in db.session.deleted if isinstance(_, ProjectChannelAnnotations)]
    if channel_annotation_ids:

        affected_projects = Project.query.join(ProjectChannelAnnotations).filter(
            ProjectChannelAnnotations.id.in_(channel_annotation_ids)).all()

        affected_locus_ids = Channel.query.join(ProjectChannelAnnotations).filter(
            ProjectChannelAnnotations.id.in_(channel_annotation_ids)).values('locus_id')

        affected_locus_ids = list(set([_[0] for _ in affected_locus_ids]))

        for p in affected_projects:
            for locus_id in affected_locus_ids:
                p.samples_changed(locus_id)

        genotype_annotations = Genotype.query.filter(
            Genotype.reference_run_id.in_(channel_annotation_ids)).all()
        for ga in genotype_annotations:
            assert isinstance(ga, Genotype)
            ga.clear_annotated_peaks()
            ga.clear_alleles()
            ga.clear_flags()

        annotations = SampleLocusAnnotation.query.filter(
            SampleLocusAnnotation.reference_run_id.in_(channel_annotation_ids)).all()
        for a in annotations:
            assert isinstance(a, SampleLocusAnnotation)
            a.clear_annotated_peaks()
            a.clear_flags()


class Genotype(SampleLocusAnnotation):
    id = db.Column(db.Integer, db.ForeignKey('sample_locus_annotation.id'), primary_key=True)
    alleles = db.Column(MutableDict.as_mutable(CompressedJSONEncodedData))

    __mapper_args__ = {
        'polymorphic_identity': 'sample_locus_genotype',
    }

    @classmethod
    def get_serialized_list(cls, project_id):
        genotypes = cls.query.filter(cls.project_id == project_id).values(
            cls.id, cls.project_id, cls.sample_annotations_id, cls.locus_id, cls.annotated_peaks, cls.reference_run_id,
            cls.flags, cls.comments, cls.last_updated, cls.alleles
        )
        res = []
        for s in genotypes:
            g = {
                'id': s[0],
                'project': s[1],
                'sample_annotations': s[2],
                'locus': s[3],
                'annotated_peaks': s[4],
                'reference_run': s[5],
                'flags': s[6],
                'comments': s[7],
                'last_updated': s[8],
                'alleles': s[9]
            }
            res.append(g)
        return res

    def __repr__(self):
        return "<Genotype {}>".format(self.locus.label)

    def clear_alleles(self):
        self.alleles = dict.fromkeys(self.alleles, False)

    def toggle_allele(self, bin_id):
        self.alleles[str(bin_id)] = not self.alleles[str(bin_id)]
        self.set_flag('manual_curation', True)


