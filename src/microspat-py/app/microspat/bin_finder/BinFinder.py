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

from app.microspat.cluster.FeatureCluster import find_clusters
import numpy as np


class BinFinder(object):
    def __init__(self, bins=None):
        if bins is None:
            bins = []
        self.bins = bins

    @classmethod
    def calculate_bins(cls, peaks, nucleotide_repeat_length=3, min_peak_frequency=1, bin_buffer=.75):
        """
        Calculate bins for a given set of peaks.

        peak = {
            'peak_size': int
        }

        :param peaks: list of peaks
        :param nucleotide_repeat_length: expected size difference between bins.
        :param min_peak_frequency: minimum number of peaks in bin for bin to be considered real
        :param bin_buffer: buffer allowed for bin classification
        :return: BinFinder
        """
        bins = []
        clusters = find_clusters('peak_size', peaks, bandwidth=nucleotide_repeat_length * .5,
                                 min_bin_freq=min_peak_frequency, cluster_all=False)

        for cluster in clusters:
            base_size = cluster['center']
            if not np.isnan(base_size):
                label = str(int(round(base_size)))
                peak_count = len(cluster['items'])

                if not bin_buffer:
                    bin_buffer = cluster['sd']

                if peak_count >= min_peak_frequency:
                    bins.append(Bin(label=label, base_size=base_size, bin_buffer=bin_buffer, peak_count=peak_count))

        return cls(bins=bins)

    def annotate_bins(self, peaks):
        """
        Annotate peak bins.  If BinFinder bin id parameter is set, will also annotate the bin id.  Peak is labeled
        with bin label if peak falls within 2 * bin_buffer.  Peak is labeled as in_bin if peak falls within bin_buffer.

        peak = {
            peak_size: int
        }

        :param peaks: list of peaks
        :return: Annotated peaks

        annotated_peak = {
            peak_size: int,
            bin: string
            in_bin: bool
            *** If bin.id is set ***
            bin_id: int
            ***
        }
        """
        peaks = [] or peaks
        peaks = sorted(peaks, key=lambda _: _['peak_height'])

        if peaks:
            for p in peaks:
                p.setdefault('in_bin', False)

            bins = sorted(self.bins, key=lambda x: x.base_size)[:]

            for peak in peaks:
                if bins:
                    bin_dists = np.array([x.base_size for x in bins])
                    peak_dists = abs(bin_dists - peak['peak_size'])
                    min_peak_dist_idx = peak_dists.argmin()
                    b = bins.pop(min_peak_dist_idx)

                    if b.base_size - b.bin_buffer * 2 <= peak['peak_size'] <= b.base_size + b.bin_buffer * 2:
                        peak['bin'] = b.label
                        if hasattr(b, 'id'):
                            peak['bin_id'] = b.id
                        if b.base_size - b.bin_buffer <= peak['peak_size'] <= b.base_size + b.bin_buffer:
                            peak['in_bin'] = True
                    else:
                        bins.insert(min_peak_dist_idx, b)
        return peaks


class Bin(object):
    def __init__(self, label, base_size, bin_buffer, peak_count=0):
        self.label = label
        self.base_size = base_size
        self.bin_buffer = bin_buffer
        self.peak_count = peak_count
