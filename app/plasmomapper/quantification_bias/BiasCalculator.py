# coding=utf-8
import numpy as np
from sklearn.linear_model import LinearRegression


def calculate_beta(peak_sets):
    """
    Given a list of sets of paired peaks with known proportions annotated, will regress the quantification bias
    factor β that can be used to correct relative peak height estimations.
    :param peak_sets: peak[2]
        peak = {
            'peak_height': int,
            'peak_size': float,
            'true_proportion': float
        }
    :return: β coefficient (float)
    """

    lm = LinearRegression(fit_intercept=False)

    X = []
    y = []
    for peak_set in peak_sets:
        peak_set.sort(key=lambda x: x['peak_size'])
        peak_one = peak_set[0]
        peak_two = peak_set[1]

        y_i = np.log((peak_one['peak_height'] - peak_one.get('artifact_contribution', 0)) / float(peak_two['peak_height'] - peak_two.get('artifact_contribution', 0))) - np.log(
            peak_one['true_proportion'] / float(peak_two['true_proportion'])
        )

        x_i = peak_one['peak_size'] - peak_two['peak_size']

        y.append(y_i)
        X.append(x_i)

    X = np.array(X)
    X = X.reshape(-1, 1)
    y = np.array(y)
    lm.fit(X, y)
    return lm.coef_[0]


def correct_peak_proportion(beta, peak_set):
    """
    Using β, corrects for the quantification bias of a set of peaks and returns the annotated peaks with
    corrected relative proportion.  peak_set must be the entire set of observed peaks to be corrected at a given locus
    for a given sample.

    :param beta: float
    :param peak_set: peak[]

    peak = {
        'peak_height': int,
        'artifact_contribution': float, (optional)
        'peak_size': float
    }

    :return: peak_set: peak[]

    peak = {
        'peak_height': int,
        'artifact_contribution': float, (optional)
        'peak_size': float,
        'relative_quantification': float,
        'corrected_relative_quantification': float
    }
    """

    total_peak_height = sum([_['peak_height'] - _.get('artifact_contribution', 0) for _ in peak_set])

    for peak in peak_set:
        peak_height = peak['peak_height'] - peak.get('artifact_contribution', 0)

        corrected_total_peak_height = sum(
            map(lambda _: (_['peak_height'] - peak.get('artifact_contribution', 0)) * np.e ** (
                beta * (peak['peak_size'] - _['peak_size'])), peak_set)
        )

        peak['relative_quantification'] = peak_height / float(total_peak_height)
        peak['corrected_relative_quantification'] = peak_height / float(corrected_total_peak_height)

    return peak_set
