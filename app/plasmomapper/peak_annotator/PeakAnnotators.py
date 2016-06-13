import numpy as np

from ..signal_processor.SignalProcessor import smooth_signal, correct_baseline


def fake_pre_annotation():
    def fn(data, peak_idx):
        return {}

    return fn


def fake_post_annotation():
    def fn(peak_annotations):
        return peak_annotations

    return fn


def annotate_relative(key, label):
    def fn(peak_annotations):
        for peak_annotation in peak_annotations:
            assert key in peak_annotation
        if peak_annotations:
            max_val = max([peak_annotation[key] for peak_annotation in peak_annotations])
            for annotation in peak_annotations:
                d = {
                    label: float(annotation[key]) / max(max_val, .000001)
                }
                annotation.update(d)
        return peak_annotations

    return fn


def annotate_fraction(key, label):
    def fn(peak_annotations):
        for peak_annotation in peak_annotations:
            assert key in peak_annotation
        if peak_annotations:
            sum_vals = sum([peak_annotation[key] for peak_annotation in peak_annotations])
            for annotation in peak_annotations:
                d = {
                    label: float(annotation[key]) / sum_vals
                }
                annotation.update(d)
        return peak_annotations

    return fn


def annotate_member_of(key, label, member_list):
    def fn(peak_annotations):
        for peak_annotation in peak_annotations:
            assert key in peak_annotation
        for annotation in peak_annotations:
            d = {
                label: annotation[key] in member_list
            }
            annotation.update(d)
        return peak_annotations

    return fn


def annotate_signal_crosstalk(other_traces, idx_dist=1, label='crosstalk_ratio'):
    def fn(data, peak_index):
        crosstalk_ratio = 0
        for trace in other_traces:
            # assert len(trace) == len(data)
            if peak_index < len(trace):
                starting_idx = max(0, peak_index - idx_dist)
                ending_idx = min(len(trace), peak_index + idx_dist + 1)
                signal_strength = float(sum(data[starting_idx:ending_idx]))
                bleedthrough_strength = float(sum(trace[starting_idx:ending_idx]))
                crosstalk_ratio = max(crosstalk_ratio, abs(bleedthrough_strength) / (abs(signal_strength) + 1))
            else:
                crosstalk_ratio = 0
        return {label: crosstalk_ratio}

    return fn


def annotate_base_size(base_sizes):
    def fn(data, peak_index):
        assert len(base_sizes) == len(data)
        return {
            'peak_size': base_sizes[peak_index]
        }

    return fn


def annotate_peak_height():
    def fn(data, peak_index):
        return {
            'peak_height': data[peak_index]
        }

    return fn


def annotate_relative_peak_height():
    return annotate_relative('peak_height', 'relative_peak_height')


def annotate_peak_height_fraction():
    return annotate_fraction('peak_height', 'peak_height_fraction')


def annotate_peak_area(data, min_relative_area_contribution=.001, noise_threshold=50):
    # Pass in data to precompute smoothed signal
    smoothed_data = correct_baseline(smooth_signal(np.array(data)))

    def fn(data, peak_index):
        left_area = 0
        right_area = 0
        i = 0

        while (len(smoothed_data) - peak_index - i > 0 and smoothed_data[
                peak_index - i] > left_area * min_relative_area_contribution and (
            smoothed_data[peak_index - i] > smoothed_data[peak_index - i - 2])) \
                or smoothed_data[peak_index - i] > noise_threshold:
            left_area += smoothed_data[peak_index - i]
            i += 1

        left_area_tail = int(i)
        i = 0

        while ((len(smoothed_data) > peak_index + i + 2) and
               (smoothed_data[peak_index + i] > right_area * min_relative_area_contribution) and
               ((smoothed_data[peak_index + i] > smoothed_data[peak_index + i + 2]) or smoothed_data[peak_index + i] > noise_threshold)):
            right_area += data[peak_index + i]
            i += 1

        right_area_tail = int(i)

        area = left_area + right_area

        return {
            'peak_area': area,
            'left_tail': left_area_tail,
            'right_tail': right_area_tail
        }

    return fn


def annotate_relative_peak_area():
    return annotate_relative('peak_area', 'relative_peak_area')


def annotate_peak_area_fraction():
    return annotate_fraction('peak_area', 'peak_area_fraction')

