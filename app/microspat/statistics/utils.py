# coding=utf-8

"""
    MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
    Copyright (C) 2016  Maxwell Murphy

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
"""

from collections import defaultdict
from itertools import groupby
import scipy.stats as st
import numpy as np


_FREQUENCIES_REQUIRED = ValueError("Locus Allele Frequencies must be provided.")


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
        annotated_peaks.sort(key=lambda _: _['bin_id'])
        for bin_label, binned_peaks in groupby(annotated_peaks, key=lambda _: _['bin_id']):
            allele_frequencies[locus_label][str(bin_label)] = len(list(binned_peaks)) / float(len(annotated_peak_sets))

    return allele_frequencies


def __extract_features(p):
    return p['probability'], p['peak_height'], p['artifact_contribution'], max(p['artifact_error'], 1e-6)


def cdf_weighted_probability(p, _):
    probability, peak_height, artifact, error = __extract_features(p)
    cdf_val = st.norm.cdf((peak_height - artifact) / error)
    return cdf_val * probability


def allele_frequency_weighted_probability(p, locus_allele_frequencies):
    if not isinstance(locus_allele_frequencies, dict):
        raise _FREQUENCIES_REQUIRED
    probability = p['probability']
    allele_frequency = locus_allele_frequencies.get(str(p['bin_id']), 0)
    return allele_frequency * probability


def combo_weighted_probability(p, locus_allele_frequencies):
    if not isinstance(locus_allele_frequencies, dict):
        raise _FREQUENCIES_REQUIRED
    probability, peak_height, artifact, error = __extract_features(p)
    cdf_val = st.norm.cdf((peak_height - artifact) / error)
    allele_frequency = locus_allele_frequencies.get(str(p['bin_id']), 0)
    return cdf_val * allele_frequency * probability


def calculate_peak_probability(peak_set, num_possible, locus_allele_frequencies=None, method='allele_frequency_weighted'):
    """
    Calculate the probability of a peak for a given MOI and set of allele frequencies.  3 different weighting methods
    available.  Allele_frequency_weighted weights peaks by allele frequency.  CDF_weighted weights peaks by how far they
    deviate from the artifact contribution estimate, based on the error associated with the estimate.  Combo_weighted
    weights peaks by combining the two methods.

    :param peak_set: Set of peaks to compare

    peak = {
        'peak_index': int,
        'probability': float
        'bin': string
        'peak_height': int (needed for cdf_weighted methods),
        'artifact_contribution': float (needed for cdf_weighted methods),
        'artifact_error': float (needed for cdf_weighted methods)
    }

    :param locus_allele_frequencies: Frequency distribution of alleles for a given locus from which peaks originate
    :param num_possible: number of peaks which are possible
    :param method: Weighting method to be used.
    :return:
    """
    methods = {
        'allele_frequency_weighted': allele_frequency_weighted_probability,
        'cdf_weighted': cdf_weighted_probability,
        'combo_weighted': combo_weighted_probability
    }

    if method not in methods.keys():
        raise KeyError("Method {} is not a valid method.  Please use one of {}".format(methods.keys()))

    method = methods[method]

    recalculated_probabilities = {}

    total_probability = (sum([method(_, locus_allele_frequencies) for _ in peak_set])) ** num_possible

    for peak in peak_set:
        other_peaks = [_ for _ in peak_set if _['peak_index'] != peak['peak_index']]
        other_peak_freqs = [method(_, locus_allele_frequencies) for _ in other_peaks]
        recalculated_probability = (total_probability - (sum(other_peak_freqs) ** num_possible)) / float(total_probability)
        print recalculated_probability
        recalculated_probabilities[peak['peak_index']] = recalculated_probability

    return recalculated_probabilities


def calculate_prob_pos_if_observed(peak_set):
    for peak in peak_set:
        prob_neg = peak['prob_negative']
        prob_observed_if_neg = st.norm.sf((peak['peak_height'] - peak['artifact_contribution']) / float(max(peak['artifact_error'], 1e-6)))

        prob_neg_if_observed = (prob_observed_if_neg * prob_neg) / float(max(((prob_observed_if_neg * prob_neg) + 1 - prob_neg), 1e-6))

        peak['probability'] = max(1 - prob_neg_if_observed, 0)
    return peak_set


def calculate_prob_negative(peak_set, moi, allele_frequencies):

    prob_all_perms = sum([_['probability'] * allele_frequencies.get(str(_['bin_id']), 0) for _ in peak_set]) ** moi
    if prob_all_perms < 1e-6:
        map(lambda _: _.update({'prob_negative': 1}), peak_set)
    else:
        for i in range(len(peak_set)):
            peak = peak_set.pop(i)
            prob_perms_without_peak = sum([allele_frequency_weighted_probability(_, allele_frequencies) for _ in peak_set]) ** moi
            # prob_perms_with_peak = prob_all_perms - prob_perms_without_peak
            prob_peak_negative = prob_perms_without_peak / prob_all_perms
            peak['prob_negative'] = prob_peak_negative

            peak_set.insert(i, peak)
    return peak_set


def calculate_moi(locus_annotations, offset=0):
    """
    Given a set of locus annotations (All calls from a sample), calculate the MOI of the sample.  If the offset is
    greater than the number of markers under consideration, returns 0.
    :param locus_annotations: (locus_label, annotated_peaks[])
    :param offset: distance from largest MOI value
    :return:
    """
    peak_counts = []
    for locus_annotation in locus_annotations:
        locus_label, annotated_peaks = locus_annotation
        peak_counts.append(len(annotated_peaks))
    peak_counts.sort()
    if len(peak_counts) > abs(-1 - offset):
        moi = peak_counts[-1 - offset]
    else:
        moi = 0
    return moi
