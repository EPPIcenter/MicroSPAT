from app.microspat.fsa_extractor.PlateExtractor import PlateExtractor
from app.microspat.models import Locus, Sample, Plate, Well, Channel
from app.utils import CaseInsensitiveDictReader


# from app import db




class LocusException(Exception):
    pass


class SampleException(Exception):
    pass


def load_loci_from_csv(f):
    r = CaseInsensitiveDictReader(f)

    valid_colors = ['orange', 'red', 'yellow', 'green', 'blue']

    if sorted(r.fieldnames) != ['color', 'label', 'max_base_length', 'min_base_length', 'nucleotide_repeat_length']:
        raise LocusException(
            "CSV fieldnames invalid. Header must be ['Label', 'Min. Base Length', 'Max. Base Length', 'Color', "
            "'Nucleotide Repeat Length']")

    loci = []
    for locus_entry in r:
        label = locus_entry['label']
        color = locus_entry['color'].lower()
        min_base_length = int(locus_entry['min_base_length'])
        max_base_length = int(locus_entry['max_base_length'])
        nucleotide_repeat_length = int(locus_entry['nucleotide_repeat_length'])

        l = Locus.query.filter(Locus.label == label).first()

        if color not in valid_colors:
            raise LocusException("Locus Color {} not valid".format(color))

        if l:
            raise LocusException("Locus {} Already Exists".format(label))

        locus = Locus(label=label, color=color, min_base_length=min_base_length, max_base_length=max_base_length,
                      nucleotide_repeat_length=nucleotide_repeat_length)
        loci.append(locus)

    return loci


def load_samples_from_csv(f):
    positive_designations = ['pos', 'positive_control', 'positive', 'positive control', '+', 'pc']
    negative_designations = ['neg', 'negative_control', 'negative', 'negative control', '-', 'nc']
    sample_designations = ['s', 'sample', '']

    r = CaseInsensitiveDictReader(f)

    if sorted(r.fieldnames) != ['barcode', 'designation']:
        raise SampleException("CSV fieldnames invalid. Header must be ['Barcode', 'Designation']")

    samples = []
    for sample_entry in r:
        if sample_entry['designation'].lower() in positive_designations:
            sample_entry['designation'] = 'positive_control'
        elif sample_entry['designation'].lower() in negative_designations:
            sample_entry['designation'] = 'negative_control'
        elif sample_entry['designation'].lower() in sample_designations:
            sample_entry['designation'] = 'sample'
        else:
            raise SampleException("Sample designation {} is not valid".format(sample_entry['designation']))

        barcode = sample_entry['barcode']
        designation = sample_entry['designation']

        sample = Sample(barcode=barcode, designation=designation)
        samples.append(sample)

    return samples


def load_plate_zips(zips, ladder):
    extracted_plates = PlateExtractor.parallel_from_zip(zips, ladder=ladder.base_sizes, color=ladder.color,
                                                        base_size_precision=ladder.base_size_precision,
                                                        sq_limit=ladder.sq_limit,
                                                        filter_parameters=ladder.filter_parameters,
                                                        scanning_parameters=ladder.scanning_parameters)
    return extracted_plates

