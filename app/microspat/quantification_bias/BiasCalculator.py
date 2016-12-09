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

import numpy as np
from sklearn.linear_model import LinearRegression, TheilSenRegressor
from sklearn.metrics import mean_squared_error, r2_score


# def x_calculate_beta(peak_sets, regressor='lsr'):
#     """
#     Given a list of sets of paired peaks with known proportions annotated, will regress the quantification bias
#     factor β that can be used to correct relative peak height estimations.
#     :param peak_sets: peak[2]
#         peak = {
#             'peak_height': int,
#             'peak_size': float,
#             'true_proportion': float
#         }
#     :return: β coefficient (float)
#     """
#
#     regressors = {
#         'lsr': LinearRegression(fit_intercept=False),
#         'tsr': TheilSenRegressor(fit_intercept=False)
#     }
#
#     lm = regressors[regressor]
#
#     X = []
#     y = []
#     for peak_set in peak_sets:
#         peak_set.sort(key=lambda x: x['peak_size'])
#         peak_one = peak_set[0]
#         peak_two = peak_set[1]
#
#         y_i1 = np.log((max(1, peak_one['peak_height'] - peak_one.get('artifact_contribution', 0))) / float(max(1, peak_two['peak_height'] - peak_two.get('artifact_contribution', 0)))) - np.log(
#             peak_one['true_proportion'] / float(peak_two['true_proportion']))
#
#         y_i2 = np.log((max(1, peak_two['peak_height'] - peak_two.get('artifact_contribution', 0))) / float(
#             max(1, peak_one['peak_height'] - peak_one.get('artifact_contribution', 0)))) - np.log(
#             peak_two['true_proportion'] / float(peak_one['true_proportion']))
#
#         x_i2 = peak_one['peak_size'] - peak_two['peak_size']
#         x_i1 = peak_two['peak_size'] - peak_one['peak_size']
#
#         y.append(y_i1)
#         X.append(x_i1)
#         y.append(y_i2)
#         X.append(x_i2)
#
#     X = np.array(X)
#     X = X.reshape(-1, 1)
#     y = np.array(y)
#     lm.fit(X, y)
#     sd = mean_squared_error(y, lm.predict(X)) ** .5
#     r2 = r2_score(y, lm.predict(X))
#     if isinstance(lm, TheilSenRegressor):
#         return lm.coef_, sd, r2
#     else:
#         return lm.coef_[0], sd, r2


def calculate_beta(peak_sets, min_peak_proportion=0, regressor='lsr'):
    """
        Given a list of sets of paired peaks with known proportions annotated, will regress the quantification bias
        factor β that can be used to correct relative peak height estimations.
        :param peak_sets: peak[2]
            peak = {
                'peak_height': int,
                'peak_size': float,
                'true_proportion': float
            }
        :param min_peak_proportion: peaks are included in model generation if
               min_peak_proportion <= peak['true_proportion'] <= (1 - min_peak_proportion)
        :param regressor: type of regressor to use, must be one of ['tsr', 'lsr']
        :return: β coefficient (float)
        """

    regressors = {
        'lsr': LinearRegression(fit_intercept=False),
        'tsr': TheilSenRegressor(fit_intercept=False)
    }

    lm = regressors[regressor]

    X = []
    y = []
    pk_data = []
    for peak_set in peak_sets:
        if len(peak_set) > 1:
            peak_center = calculate_peak_center(peak_set)
            peak_size_total = calculate_peak_size_total(peak_set)
            for peak in peak_set:
                if min_peak_proportion <= peak['true_proportion'] <= (1 - min_peak_proportion):
                    p = {
                        'size_diff': peak['peak_size'] - peak_center,
                        'true_prop': peak['true_proportion'],
                        'obs_prop': max(1, peak['peak_height'] - peak.get('artifact_contribution', 0)) / float(peak_size_total)
                    }
                    pk_data.append(p)

    log_odds_obs = np.log([_['obs_prop'] / (1 - _['obs_prop']) + 1e-6 for _ in pk_data])
    log_odds_true = np.log([_['true_prop'] / (1 - _['true_prop']) + 1e-6 for _ in pk_data])
    size_diff = np.array([_['size_diff'] for _ in pk_data])

    lm.fit(size_diff.reshape(-1, 1), log_odds_obs - log_odds_true)
    sd = mean_squared_error(log_odds_obs - log_odds_true, lm.predict(size_diff.reshape(-1, 1))) ** .5
    r2 = r2_score(log_odds_obs - log_odds_true, lm.predict(size_diff.reshape(-1, 1)))

    if isinstance(lm, TheilSenRegressor):
        return lm.coef_, sd, r2
    else:
        return lm.coef_[0], sd, r2


def calculate_peak_size_total(peak_set):
    return sum([max(1, _['peak_height'] - _.get('artifact_contribution', 0)) for _ in peak_set])


def calculate_peak_center(peak_set):
    peak_center = np.mean(list(set([_['peak_size'] for _ in peak_set])))
    return peak_center


# def x_correct_peak_proportion(beta, peak_set):
#     """
#     Using β, corrects for the quantification bias of a set of peaks and returns the annotated peaks with
#     corrected relative proportion.  peak_set must be the entire set of observed peaks to be corrected at a given locus
#     for a given sample.
#
#     :param beta: float
#     :param peak_set: peak[]
#
#     peak = {
#         'peak_height': int,
#         'artifact_contribution': float, (optional)
#         'peak_size': float
#     }
#
#     :return: peak_set: peak[]
#
#     peak = {
#         'peak_height': int,
#         'artifact_contribution': float, (optional)
#         'peak_size': float,
#         'relative_quantification': float,
#         'corrected_relative_quantification': float
#     }
#     """
#
#     total_peak_height = sum([max(1, _['peak_height'] - _.get('artifact_contribution', 0)) for _ in peak_set])
#
#     pivot_point = np.mean(list(set([_['peak_size'] for _ in peak_set])))
#
#     if beta:
#         corrected_total_peak_height = sum(
#             map(lambda _: max(1, (_['peak_height'] - _.get('artifact_contribution', 0))) * np.e ** (
#                 beta * (_['peak_size'] - pivot_point)), peak_set)
#         )
#     else:
#         corrected_total_peak_height = total_peak_height
#
#     for peak in peak_set:
#         peak_height = max(1, peak['peak_height'] - peak.get('artifact_contribution', 0))
#
#         if beta:
#             corrected_peak_height = peak_height * np.e ** (beta * (peak['peak_size'] - pivot_point))
#         else:
#             corrected_peak_height = peak_height
#
#         peak['relative_quantification'] = peak_height / float(total_peak_height)
#         peak['corrected_relative_quantification'] = corrected_peak_height / float(corrected_total_peak_height)
#
#     return peak_set


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
    peak_center = calculate_peak_center(peak_set)
    peak_size_total = calculate_peak_size_total(peak_set)

    for peak in peak_set:
        peak_height = max(1, peak['peak_height'] - peak.get('artifact_contribution', 0))
        size_diff = peak['peak_size'] - peak_center
        peak['relative_quantification'] = peak_height / float(peak_size_total)

        if beta:
            f = np.e ** (beta * size_diff - np.log(peak['relative_quantification'] + 1e-240) + np.log((1 - peak['relative_quantification']) + 1e-240))
            peak['corrected_relative_quantification'] = 1 / (1 + f)
        else:
            peak['corrected_relative_quantification'] = peak['relative_quantification']

    unnormalized_quantification = sum([_['corrected_relative_quantification'] for _ in peak_set])
    for peak in peak_set:
        peak['corrected_relative_quantification'] = peak['corrected_relative_quantification'] / unnormalized_quantification
    # print abs(sum([_['corrected_relative_quantification'] for _ in peak_set]) - 1)
    # assert abs(sum([_['corrected_relative_quantification'] for _ in peak_set]) - 1) < 1e-3

    return peak_set
