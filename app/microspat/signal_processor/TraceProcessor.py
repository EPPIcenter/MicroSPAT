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

import itertools
import logging

import numpy as np
from scipy import interpolate
from scipy.signal import find_peaks_cwt, argrelmax
from SignalProcessor import smooth_signal, correct_baseline


class NoLadderException(Exception):
    pass


class GenericChannelProcessor(object):
    def __init__(self, channel, scanning_parameters=None, **kwargs):
        if scanning_parameters is None:
            scanning_parameters = {}

        self.channel = channel
        self.bleedthrough_channels = kwargs.get('bleedthrough_channels', [])

        self.scanning_method = scanning_parameters.get('scanning_method', 'relmax')
        self.maxima_window = scanning_parameters.get('maxima_window', 10)

        # ArgRelMax peak identification params
        self.argrelmax_window = scanning_parameters.get('argrelmax_window', 6)
        self.smoothing_window = scanning_parameters.get('smoothing_window', 11)
        self.smoothing_order = scanning_parameters.get('smoothing_order', 7)
        self.tophat_factor = scanning_parameters.get('tophat_factor', .005)

        # CWT peak identification parameters
        if 'cwt_min_width' and 'cwt_max_width' in scanning_parameters:
            self.widths = np.arange(scanning_parameters.get('cwt_min_width'), scanning_parameters.get('cwt_max_width'))
        else:
            self.widths = np.arange(4, 15)
        self.min_snr = scanning_parameters.get('min_snr', 3)
        self.noise_perc = scanning_parameters.get('noise_perc', 13)
        self.gap_threshold = scanning_parameters.get('gap_threshold', 2)

    def find_peak_local_maxima(self, peak_indices):
        trace = self.channel.data
        window_size = int(self.maxima_window)
        temp = []
        half_window = window_size / 2
        for p in peak_indices:
            if len(trace) > p + half_window:
                for i in range(max(0, p - half_window), p + half_window):
                    if trace[i] > trace[p]:
                        p = i
            temp.append(p)
        return temp

    def find_peak_indices(self):
        if self.scanning_method == 'cwt':
            return self.find_peak_indices_by_cwt()
        elif self.scanning_method == 'relmax':
            return self.find_peak_indices_by_relmax()
        else:
            raise ValueError("{0} is not a valid peak finding method.".format(self.scanning_method))

    def find_peaks(self):
        raise NotImplementedError("find_peaks not implemented for {0}".format(type(self).__name__))

    def find_peak_indices_by_cwt(self):
        peak_indices = find_peaks_cwt(self.channel.data, widths=self.widths,
                                      min_snr=self.min_snr, noise_perc=self.noise_perc,
                                      gap_thresh=self.gap_threshold)
        return peak_indices

    def find_peak_indices_by_relmax(self):
        signal = smooth_signal(np.array(self.channel.data), self.smoothing_window, self.smoothing_order)
        signal = correct_baseline(signal, self.tophat_factor)
        peak_indices = argrelmax(signal, order=self.argrelmax_window)[0].tolist()
        return peak_indices


class LadderProcessor(GenericChannelProcessor):
    def __init__(self, channel, ladder, filter_parameters=None, scanning_parameters=None, sq_limit=1,
                 base_size_precision=2, **kwargs):
        """
        :param channel: models.Channel object
        :param ladder: Object providing at a minimum the expected base sizes of peaks
        :param kwargs: Optional settings affecting peak finding and filtering
        :return:
        """
        super(LadderProcessor, self).__init__(channel, scanning_parameters, **kwargs)
        if filter_parameters is None:
            filter_parameters = {}

        self._peak_indices = []
        self._base_sizes = []
        self._sq = None
        self.ladder = ladder

        self.sq_limit = sq_limit
        self.base_size_precision = base_size_precision

        self.index_overlap = filter_parameters.get('index_overlap', 15)
        self.min_time = filter_parameters.get('min_time', 1200)
        self.max_peak_height = filter_parameters.get('max_peak_height', 12000)
        self.min_peak_height = filter_parameters.get('min_peak_height', 200)
        self.outlier_limit = filter_parameters.get('outlier_limit', 3)
        self.maximum_missing_peak_count = filter_parameters.get('maximum_missing_peak_count', 5)
        self.allow_bleedthrough = filter_parameters.get('allow_bleedthrough', True)
        self.remove_outliers = filter_parameters.get('remove_outliers', True)

    @property
    def sizing_quality(self):
        if self._sq is not None:
            return self._sq
        else:
            raise NoLadderException("No Sizing Quality. Have you processed the ladder?")

    @property
    def peaks(self):
        if self._peak_indices is not None:
            return self._peak_indices
        else:
            raise NoLadderException("No Peak Indices. Have you processed the ladder?")

    def find_peaks(self):
        if not self._peak_indices:
            peak_indices = self.find_peak_indices()
            peak_indices = self.remove_size_outliers(peak_indices)

            peak_indices = self.find_peak_local_maxima(peak_indices)

            if not self.allow_bleedthrough:
                peak_indices = self.remove_bleedthrough(peak_indices)

            peak_indices = self.remove_time_outliers(peak_indices)

            if self.remove_outliers:
                peak_indices = self.remove_signal_outliers(peak_indices)

            peak_indices = self.remove_peak_overlap(peak_indices)
            peak_indices = list(set(peak_indices))
            self._peak_indices = sorted(peak_indices)
        return self._peak_indices

    def get_base_sizes(self, peak_indices=None):
        if not peak_indices:
            if not self._base_sizes:
                peak_indices = self.find_peaks()
            else:
                return self._base_sizes
        else:
            peak_indices = sorted(peak_indices)
        spline, sq, peaks = self.generate_spline(peak_indices, manual_peak_override=True)
        r = lambda x: round(x, self.base_size_precision)
        base_sizes = map(r, map(float, map(spline, range(1, len(self.channel.data) + 1))))
        self._base_sizes = base_sizes
        self._sq = sq
        self._peak_indices = peak_indices
        return self._base_sizes

    def generate_spline(self, peak_indices, manual_peak_override=False, refined_residual=float("inf"),
                        refined_spline=None):
        """
        TODO: change to iterative algorithm by creating local scope in function to reduce memory impact.  Haven't
        evaluated if this is necessary
        :param peak_indices: Indices of peaks to calculate ladder
        :param manual_peak_override: If true, will generate the spline and residual using only the peak indices given.
        If false, will use subsets of the peak indices to generate the best fit spline based on lowest residual.
        :param refined_residual: Starting residual, necessary for recursive algorithm
        :param refined_spline:
        :return:
        """

        if len(peak_indices) < len(self.ladder) - self.maximum_missing_peak_count:
            raise NoLadderException("Not enough ladder peaks identified to generate accurate spline.")

        if len(peak_indices) > len(self.ladder) + self.outlier_limit:
            raise NoLadderException("Too many peaks identified to generate accurate spline.")

        if len(peak_indices) > len(self.ladder):
            for peak_combination in itertools.combinations(peak_indices, len(self.ladder)):
                spline = interpolate.UnivariateSpline(peak_combination, self.ladder, k=3)
                logging.debug(peak_combination)
                logging.debug(spline.get_residual())
                if spline.get_residual() < refined_residual:
                    refined_residual = spline.get_residual()
                    refined_spline = spline
                    peaks = peak_combination
            if refined_residual > self.sq_limit and not manual_peak_override:
                peak_indices = self.remove_signal_outlier(peak_indices)
                return self.generate_spline(peak_indices, refined_residual=refined_residual,
                                            refined_spline=refined_spline)
            else:
                return [refined_spline, refined_residual, peaks]
        else:
            for ladder_subset in itertools.combinations(self.ladder, len(peak_indices)):
                spline = interpolate.UnivariateSpline(peak_indices, ladder_subset, k=3)
                logging.debug(ladder_subset)
                logging.debug(spline.get_residual())
                if spline.get_residual() < refined_residual:
                    refined_residual = spline.get_residual()
                    refined_spline = spline
            if refined_residual > self.sq_limit and not manual_peak_override:
                peak_indices = self.remove_signal_outlier(peak_indices)
                return self.generate_spline(peak_indices, refined_residual=refined_residual,
                                            refined_spline=refined_spline)
            else:
                return [refined_spline, refined_residual, peak_indices]

    def remove_size_outliers(self, peak_indices):
        peak_indices = [x for x in peak_indices if self.min_peak_height < self.channel.data[x] < self.max_peak_height]
        return peak_indices

    def remove_time_outliers(self, peak_indices):
        peak_indices = [x for x in peak_indices if x > self.min_time]
        return peak_indices

    def remove_bleedthrough(self, peak_indices):
        for bleedthrough_channel in self.bleedthrough_channels:
            peak_indices = [peak for peak in peak_indices if self.channel.data[peak] > bleedthrough_channel.data[peak]]
        return peak_indices

    def remove_peak_overlap(self, peak_indices):
        peak_indices.sort()
        peak_indices_length = len(peak_indices)
        i = 0
        while i < peak_indices_length - 1:
            if peak_indices[i + 1] - peak_indices[i] < self.index_overlap:
                if self.channel.data[peak_indices[i]] > self.channel.data[peak_indices[i + 1]]:
                    peak_indices.remove(peak_indices[i + 1])
                else:
                    peak_indices.remove(peak_indices[i])
                peak_indices_length -= 1
            else:
                i += 1
        return peak_indices

    def remove_signal_outliers(self, peak_indices):
        if len(peak_indices) > len(self.ladder) + 2:
            peak_indices = self.remove_signal_outlier(peak_indices)

        while len(peak_indices) >= len(self.ladder) + self.outlier_limit:
            peak_indices = self.remove_signal_outlier(peak_indices)
        return peak_indices

    def remove_signal_outlier(self, peak_indices):
        peak_heights = np.array([self.channel.data[_] for _ in peak_indices])
        peak_indices_and_heights = np.array(zip(peak_indices, peak_heights))
        peak_heights = np.array([x[1] for x in peak_indices_and_heights])
        if peak_heights.mean() < self.min_peak_height:
            raise NoLadderException("Peaks too small to reliably identify ladder.")
        peak_height_med = np.median(peak_heights)
        distance_vec = abs(peak_indices_and_heights[:, 1] - peak_height_med)
        max_dist_index = distance_vec.argmax()
        peak_indices_and_heights = np.delete(peak_indices_and_heights, max_dist_index, 0)
        return list(peak_indices_and_heights[:, 0])


class MicrosatelliteProcessor(GenericChannelProcessor):
    def __init__(self, channel, scanning_parameters=None):
        GenericChannelProcessor.__init__(self, channel, scanning_parameters)

    def find_peaks(self):
        peak_indices = self.find_peak_indices()
        peak_indices.sort()
        peak_indices = self.find_peak_local_maxima(peak_indices)
        peak_indices = sorted(list(set(peak_indices)))
        return peak_indices
