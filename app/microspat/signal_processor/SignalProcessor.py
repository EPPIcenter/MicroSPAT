import numpy as np
from scipy import ndimage
from scipy.signal import savgol_filter


def smooth_signal(raw_signal, window_size=11, order=7):
    """ smooth signal using savitzky_golay algorithm """
    return savitzky_golay(raw_signal, window_size, order)


def correct_baseline(signal, tophat_factor=.005):
    """ use tophat morphological transform to correct for baseline """
    footprint = np.repeat([1], int(round(signal.size * tophat_factor)))
    return ndimage.white_tophat(signal, None, footprint)


def savitzky_golay(y, window_length, polyorder, derivative=0, rate=1):
    return savgol_filter(y, window_length=window_length, polyorder=polyorder, deriv=derivative, delta=rate)
