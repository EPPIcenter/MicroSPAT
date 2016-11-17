// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

export interface PeakScanner {
    scanning_method: string;
    maxima_window: number;
    argrelmax_window: number;
    trace_smoothing_window: number;
    trace_smoothing_order: number;
    tophat_factor: number;
    cwt_min_width: number;
    cwt_max_width: number;
    min_snr: number;
    noise_perc: number; 
}