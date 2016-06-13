# coding=utf-8
from collections import defaultdict
from itertools import groupby


def calculate_allele_frequencies(locus_annotations):
    """
    Calculate allele frequencies from given sets of annotated peaks. Each locus annotation indicates the observations at
    a locus for one sample.  Allele frequency for allele a_i = Σ(presence of a_i) / Σ(samples) -- thus allele frequencies
    may sum to greater than 1 due to mixed infection.

    locus_annotation = (locus_label, annotated_peaks[])

    annotated_peak = {
        ...
        bin: string
        ...
    }

    :param locus_annotations: locus_annotation[]
    :return: Allele frequencies for each unique locus

    allele_frequencies = {
        locus_label: {
            bin_label_1: float
            bin_label_2: float
            ...
            ...
        }
    }

    """

    allele_frequencies = defaultdict(dict)

    locus_annotations.sort(key=lambda _: _[0])

    for locus_label, locus_annotation in groupby(locus_annotations, key=lambda _: _[0]):
        annotated_peak_sets = filter(lambda _: len(_) > 0, map(lambda _: _[1], locus_annotation))
        annotated_peaks = reduce(lambda _, __: _ + __, annotated_peak_sets, [])
        annotated_peaks.sort(key=lambda _: _['bin'])
        for bin_label, binned_peaks in groupby(annotated_peaks, key=lambda _: _['bin']):
            allele_frequencies[locus_label][bin_label] = len(list(binned_peaks)) / float(len(annotated_peak_sets))

    return allele_frequencies


# def calculate_peak_probability(allele_frequencies, locus_annotation, moi):
#     locus_label, peaks = locus_annotation
#
#     for peak in peaks:
#         other_peaks = [_ for _ in peaks if _['peak_index'] != peak['peak_index']]
#
#         this_adj_peak_freq = allele_frequencies[locus_label][peak['bin']]
#         other_adj_peak_freqs = [allele_frequencies[locus_label][_['bin']] * _['probability']]


def calculate_moi(locus_annotations, offset=1):
    peak_counts = []
    for locus_annotation in locus_annotations:
        locus_label, annotated_peaks = locus_annotation
        peak_counts.append(len(annotated_peaks))
    peak_counts.sort()
    if len(peak_counts) > -1 - offset:
        moi = peak_counts[-1 - offset]
    else:
        moi = 0
    return moi

