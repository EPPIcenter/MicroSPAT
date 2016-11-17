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

def between_values_filter(lesser, greater, key):
    def fn(peak_annotations):
        return filter(lambda x: lesser <= x[key] <= greater, peak_annotations)
    return fn


def less_than_filter(value, key):
    def fn(peak_annotations):
        return filter(lambda x: x[key] < value, peak_annotations)
    return fn


def greater_than_filter(value, key, or_equal=False):
    def fn(peak_annotations):
        if or_equal:
            return filter(lambda x: x[key] >= value, peak_annotations)
        else:
            return filter(lambda x: x[key] > value, peak_annotations)
    return fn


def base_size_filter(min_size=0, max_size=1000):
    return between_values_filter(min_size, max_size, 'peak_size')


def peak_height_filter(min_height=0, max_height=float('inf')):
    return between_values_filter(min_height, max_height, 'peak_height')


def relative_peak_height_filter(min_relative_peak_height=0):
    return greater_than_filter(min_relative_peak_height, 'relative_peak_height')


def bleedthrough_filter(max_bleedthrough_ratio):
    return less_than_filter(max_bleedthrough_ratio, 'bleedthrough_ratio')


def crosstalk_filter(max_crosstalk_ratio):
    return less_than_filter(max_crosstalk_ratio, 'crosstalk_ratio')


def probability_filter(probability_threshold):
    return greater_than_filter(probability_threshold, 'probability', or_equal=True)


def artifact_filter(min_peak_height, sd_multiplier):
    def fn(peak_annotations):
        return filter(lambda x: (x['peak_height'] - x['artifact_contribution'] - sd_multiplier * x[
            'artifact_error']) > min_peak_height, peak_annotations)
    return fn


def bin_filter(in_bin):
    def fn(peak_annotations):
        return filter(lambda _: _['in_bin'] is in_bin, peak_annotations)
    return fn


def flag_filter(flag):
    def fn(peak_annotations):
        return filter(lambda _: not(_['flags'][flag]), peak_annotations)
    return fn


def flags_filter(flags=None):
    if not flags:
        def fn(peak_annotations):
            return filter(lambda _: not any(_['flags'].values()), peak_annotations)
        return fn
    else:
        filter_fns = [flag_filter(_) for _ in flags]
        return compose_filters(*filter_fns)


def peak_proximity_filter(min_peak_distance):
    """
    Keep tallest peak of peaks that fall within a min_peak_distance of each other.
    :param min_peak_distance: base size distance between two peaks
    :return: peak_filter_fn
    """

    def fn(peak_annotations):
        filtered_peak_annotations = {}

        sorted_peak_list = sorted(peak_annotations, key=lambda x: x['peak_size'])
        if sorted_peak_list:
            curr_peak = sorted_peak_list[0]

            for peak in sorted_peak_list:
                if peak['peak_index'] == curr_peak['peak_index']:
                    continue
                if abs(peak['peak_size'] - curr_peak['peak_size']) > min_peak_distance:
                    filtered_peak_annotations[curr_peak['peak_index']] = curr_peak
                    curr_peak = peak
                elif peak['peak_height'] > curr_peak['peak_height']:
                    curr_peak = peak

            filtered_peak_annotations[curr_peak['peak_index']] = curr_peak

            sorted_peak_list.sort(key=lambda x: x['peak_size'], reverse=True)

            curr_peak = sorted_peak_list[0]

            for peak in sorted_peak_list:
                if peak['peak_index'] == curr_peak['peak_index']:
                    continue
                if abs(peak['peak_size'] - curr_peak['peak_size']) > min_peak_distance:
                    filtered_peak_annotations[curr_peak['peak_index']] = curr_peak
                    curr_peak = peak
                elif peak['peak_height'] > curr_peak['peak_height']:
                    curr_peak = peak

            filtered_peak_annotations[curr_peak['peak_index']] = curr_peak

        return filtered_peak_annotations.values()

    return fn


def compose_filters(*filters):
    def f(peak_annotations):
        for filter_fn in filters:
            peak_annotations = filter_fn(peak_annotations)
        return peak_annotations
    return f


def peak_annotations_diff(left, right):
    """
    returns peak annotations of left not contained in right, where peak_annotations are unique by their 'peak_index'
    value
    :param left:
    :param right:
    :return:
    """
    left_set = set([_['peak_index'] for _ in left])
    right_set = set([_['peak_index'] for _ in right])
    diff = left_set - right_set
    return [_ for _ in left if _['peak_index'] in diff]

