from app.plasmomapper.cluster.ClusterModel import find_clusters
import numpy as np


class BinFinder(object):
    def __init__(self, bins=None):
        if bins is None:
            bins = []

        self.bins = bins

    def calculate_bins(self, peaks, nucleotide_repeat_length=3, min_peak_frequency=20, bin_buffer=.75):
        self.bins = []
        clusters = find_clusters('peak_size', peaks, bandwidth=nucleotide_repeat_length * .5,
                                 min_bin_freq=min_peak_frequency, cluster_all=False)

        for cluster in clusters:
            base_size = cluster['center']
            label = str(round(base_size))
            peak_count = len(cluster['items'])

            if not bin_buffer:
                bin_buffer = cluster['sd']

            if peak_count > min_peak_frequency:
                self.bins.append(Bin(label=label, base_size=base_size, bin_buffer=bin_buffer, peak_count=peak_count))

    def peak_bin_annotator(self, annotated_peaks):
        peaks = [] or annotated_peaks
        peaks = sorted(peaks, key=lambda x: x['peak_size'])

        if peaks:
            map(lambda x: x.setdefault('in_bin', False), peaks)

            bins = sorted(self.bins, key=lambda x: x.base_size)
            bin_dists = np.array([x.base_size for x in bins])

            for peak in peaks:
                peak_dists = abs(bin_dists - peak['peak_size'])
                min_peak_dist_idx = peak_dists.argmin()
                b = bins[min_peak_dist_idx]

                if b.base_size - b.bin_buffer * 2 <= peak['peak_size'] <= b.base_size + b.bin_buffer * 2:
                    peak['bin'] = b.label
                    if hasattr(b, 'id'):
                        peak['bin_id'] = b.id
                    if b.base_size - b.bin_buffer <= peak['peak_size'] <= b.base_size + b.bin_buffer:
                        peak['in_bin'] = True

            # bins = sorted(self.bins, key=lambda x: x.base_size)
            # i = 0
            # len_peaks = len(peaks)
            #
            # peak = peaks[i]
            # while bins:
            #     b = bins.pop(0)
            #     while peak['peak_size'] <= b.base_size + b.bin_buffer:
            #         if b.base_size - b.bin_buffer <= peak['peak_size']:
            #             peak['in_bin'] = True
            #             peak['bin'] = b.label
            #             if hasattr(b, 'id'):
            #                 peak['bin_id'] = b.id
            #         i += 1
            #         if i < len_peaks:
            #             peak = peaks[i]
            #         else:
            #             break
        return annotated_peaks


class Bin(object):
    def __init__(self, label, base_size, bin_buffer, peak_count=0):
        self.label = label
        self.base_size = base_size
        self.bin_buffer = bin_buffer
        self.peak_count = peak_count
