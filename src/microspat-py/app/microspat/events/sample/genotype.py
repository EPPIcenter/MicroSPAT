from app.microspat.schemas import DeferredGenotypeSchema
from app.microspat.models import Genotype
from app.microspat.events.base import (
    make_namespace,
    table_to_string_mapping,
    extract_ids,
)

from app import socketio
from app.utils import subset

JSON_NAMESPACE = table_to_string_mapping[Genotype]
SOCK_NAMESPACE = make_namespace(JSON_NAMESPACE)

schema = DeferredGenotypeSchema()


@socketio.on('get', namespace=SOCK_NAMESPACE)
def get_genotypes(json):
    ids = extract_ids(json)
    for id_subset in subset(ids, 500):
        genotypes = []
        for id in id_subset:
            genotype = next(Genotype.query.filter(Genotype.id == id).values(
                Genotype.id, Genotype.project_id, Genotype.sample_annotations_id, Genotype.locus_id,
                Genotype.annotated_peaks, Genotype.reference_run_id, Genotype.flags, Genotype.comments,
                Genotype.last_updated, Genotype.alleles
            ))
            genotypes.append(genotype)
        # genotypes = Genotype.query.filter(Genotype.id.in_(id_subset)).values(
        #     Genotype.id, Genotype.project_id, Genotype.sample_annotations_id, Genotype.locus_id,
        #     Genotype.annotated_peaks, Genotype.reference_run_id, Genotype.flags, Genotype.comments,
        #     Genotype.last_updated, Genotype.alleles
        # )
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

        missing_ids = list(set(id_subset) - set([_['id'] for _ in res]))

        if missing_ids:
            socketio.emit('get_failed', {JSON_NAMESPACE: missing_ids}, namespace=make_namespace(JSON_NAMESPACE))

        genotypes_dump = schema.dumps(res, many=True)
        socketio.emit('get', {JSON_NAMESPACE: genotypes_dump}, namespace=make_namespace(JSON_NAMESPACE))
        socketio.sleep()


@socketio.on('get_updated', namespace=SOCK_NAMESPACE)
def get_genotypes(json):
    ids = extract_ids(json)
    for id_subset in subset(ids, 500):
        genotypes = []
        for id in id_subset:
            genotype = next(Genotype.query.filter(Genotype.id == id).values(
                Genotype.id, Genotype.project_id, Genotype.sample_annotations_id, Genotype.locus_id,
                Genotype.annotated_peaks, Genotype.reference_run_id, Genotype.flags, Genotype.comments,
                Genotype.last_updated, Genotype.alleles
            ))
            genotypes.append(genotype)
        # genotypes = Genotype.query.filter(Genotype.id.in_(id_subset)).values(
        #     Genotype.id, Genotype.project_id, Genotype.sample_annotations_id, Genotype.locus_id,
        #     Genotype.annotated_peaks, Genotype.reference_run_id, Genotype.flags, Genotype.comments,
        #     Genotype.last_updated, Genotype.alleles
        # )
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

        genotypes_dump = schema.dumps(res, many=True)
        socketio.emit('get_updated', {JSON_NAMESPACE: genotypes_dump}, namespace=make_namespace(JSON_NAMESPACE))
        socketio.sleep()

