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
