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

import hashlib
import zipfile
from io import IOBase

from app import socketio
from app.microspat.fsa_tools.FSAExtractor import FSAFile
from app.microspat.peak_annotator.PeakAnnotators import *
from app.microspat.signal_processor.TraceProcessor import LadderProcessor, MicrosatelliteProcessor, NoLadderException


capillary_order = ['H01', 'H02', 'G01', 'G02', 'F01', 'F02', 'E01', 'E02',
                   'D01', 'D02', 'C01', 'C02', 'B01', 'B02', 'A01', 'A02',
                   'H03', 'H04', 'G03', 'G04', 'F03', 'F04', 'E03', 'E04',
                   'D03', 'D04', 'C03', 'C04', 'B03', 'B04', 'A03', 'A04',
                   'H05', 'H06', 'G05', 'G06', 'F05', 'F06', 'E05', 'E06',
                   'D05', 'D06', 'C05', 'C06', 'B05', 'B06', 'A05', 'A06',
                   'H07', 'H08', 'G07', 'G08', 'F07', 'F08', 'E07', 'E08',
                   'D07', 'D08', 'C07', 'C08', 'B07', 'B08', 'A07', 'A08',
                   'H09', 'H10', 'G09', 'G10', 'F09', 'F10', 'E09', 'E10',
                   'D09', 'D10', 'C09', 'C10', 'B09', 'B10', 'A09', 'A10',
                   'H11', 'H12', 'G11', 'G12', 'F11', 'F12', 'E11', 'E12',
                   'D11', 'D12', 'C11', 'C12', 'B11', 'B12', 'A11', 'A12']

# Construct 96 well list
letters = [chr(x) for x in range(ord("A"), ord("H") + 1)]
nums = [str(x).rjust(2, '0') for x in range(1, 13)]
well_order_96 = [l + num for l in letters for num in nums]

# Construct 384 well list
letters = [chr(x) for x in range(ord("A"), ord("P") + 1)]
nums = [str(x).rjust(2, '0') for x in range(1, 25)]
well_order_384 = [l + num for l in letters for num in nums]


class ExtractedPlate(object):
    # The order of capillaries that are fed into the CE machine.  This is used during crosstalk detection as adjacent
    # capillaries will exhibit some signal mixing

    well_list = {
        96: well_order_96,
        384: well_order_384
    }

    # The row mapping of a 384 well plate into a 96 well quad
    row_mapping = {'A': 'A',
                   'B': 'A',
                   'C': 'B',
                   'D': 'B',
                   'E': 'C',
                   'F': 'C',
                   'G': 'D',
                   'H': 'D',
                   'I': 'E',
                   'J': 'E',
                   'K': 'F',
                   'L': 'F',
                   'M': 'G',
                   'N': 'G',
                   'O': 'H',
                   'P': 'H'}

    _WELL_LETTERS_96 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    _Q1_2LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O']
    _Q3_4LETTERS = ['B', 'D', 'F', 'H', 'J', 'L', 'N', 'P']

    def __init__(self, label, well_arrangement=None, wells=None, current=None, voltage=None, power=None,
                 temperature=None, date_run=None, creator=None, comments=None, ce_machine=None, plate_hash=None):
        if temperature is None:
            temperature = []

        if power is None:
            power = []

        if voltage is None:
            voltage = []

        if current is None:
            current = []

        if wells is None:
            wells = []
        else:
            for well in wells:
                if not hasattr(well, 'plate'):
                    well.plate = self

        self._wells_dict = None
        self.label = label
        self.wells = wells
        self.power = power
        self.current = current
        self.voltage = voltage
        self.temperature = temperature

        self.well_arrangement = well_arrangement
        self.date_run = date_run
        self.creator = creator
        self.comments = comments
        self.ce_machine = ce_machine
        self.plate_hash = plate_hash

    @property
    def wells_dict(self):
        if not self._wells_dict:
            self._wells_dict = {well.well_label: well for well in self.wells}
        return self._wells_dict

    def __repr__(self):
        return "<Plate {0}>".format(self.label)

    @classmethod
    def convert_from_quad(cls, quad, well_label):
        """
        Method to convert a well_label and quad number into corresponding 384 well_label
        :param quad: 1 to 4
        :param well_label: 96 well label
        :return:
        """

        num = int(well_label[1:])
        letter = well_label[0]

        idx = cls._WELL_LETTERS_96.index(letter)

        if letter not in cls._WELL_LETTERS_96 or 0 > num >= 12 or quad not in [1, 2, 3, 4]:
            raise ValueError('%s is not a valid well label.' % well_label)

        if quad in [1, 2]:
            quad_letter = cls._Q1_2LETTERS[idx]
        elif quad in [3, 4]:
            quad_letter = cls._Q3_4LETTERS[idx]

        if quad % 2 == 0:
            offset = 0
        else:
            offset = -1

        quad_number = num * 2 + offset

        if quad_number < 10:
            quad_number = '0' + str(quad_number)
        else:
            quad_number = str(quad_number)

        return quad_letter + quad_number

    @classmethod
    def convert_to_quad(cls, well_label):
        """
        Convert from a 384 well label into a 96 well label with quad.
        :param well_label: 384 well label
        :return:
        """
        num = int(well_label[1:])
        letter = well_label[0]

        if letter not in cls._Q1_2LETTERS + cls._Q3_4LETTERS or not (0 < num <= 24):
            raise ValueError("%s is not a valid well label." % well_label)

        if letter in cls._Q1_2LETTERS:
            new_letter = cls._WELL_LETTERS_96[cls._Q1_2LETTERS.index(letter)]
            if num % 2 == 0:
                new_num = num / 2
                quad = 2
            else:
                new_num = (num + 1) / 2
                quad = 1
        elif letter in cls._Q3_4LETTERS:
            new_letter = cls._WELL_LETTERS_96[cls._Q3_4LETTERS.index(letter)]
            if num % 2 == 0:
                new_num = num / 2
                quad = 4
            else:
                new_num = (num + 1) / 2
                quad = 3

        if new_num < 10:
            new_num = '0' + str(int(new_num))
        else:
            new_num = str(int(new_num))

        quad_well_label = new_letter + new_num

        return quad, quad_well_label

    @classmethod
    def from_zip(cls, zip_file, creator=None, comments=None):
        label = ''
        wells = []
        well_arrangement = 0
        date_run = None
        ce_machine = None
        temperature = None
        current = None
        voltage = None
        power = None
        with zipfile.ZipFile(zip_file) as f:
            for member in f.namelist():
                if member.endswith('.fsa'):
                    with f.open(member) as fsa:
                        fsa = FSAFile(fsa.read())
                        well = WellExtractor.from_fsa(fsa)
                        wells.append(well)
                        well_arrangement = fsa.plate_size
                        date_run = fsa.date_run
                        ce_machine = fsa.ce_machine
                        label = fsa.plate
                        temperature = fsa.temperature
                        current = fsa.current
                        voltage = fsa.voltage
                        power = fsa.power
        well_hashes = "".join([well.fsa_hash for well in sorted(wells, key=lambda x: x.well_label)]).encode('utf-8')
        plate_hash = hashlib.md5(well_hashes).hexdigest()
        return cls(label=label, wells=wells, temperature=temperature, current=current, voltage=voltage, power=power,
                   well_arrangement=well_arrangement, date_run=date_run, creator=creator,
                   comments=comments, ce_machine=ce_machine, plate_hash=plate_hash)

    @classmethod
    def from_zip_and_calculate_base_sizes(cls, zip_file, ladder, color, base_size_precision, sq_limit,
                                          filter_parameters, scanning_parameters, creator=None, comments=None):
        p = cls.from_zip(zip_file, creator, comments)
        p.calculate_base_sizes(ladder=ladder, color=color, base_size_precision=base_size_precision, sq_limit=sq_limit,
                               filter_parameters=filter_parameters, scanning_parameters=scanning_parameters)

        return p

    def surrounding_wells(self, well_label, distance):
        quad = None
        if self.well_arrangement == 384:
            quad, well_label = self.convert_to_quad(well_label)

        well_idx = capillary_order.index(well_label)
        starting_idx = max(0, well_idx - distance)
        ending_idx = min(96, well_idx + distance + 1)

        surrounding_well_list = capillary_order[starting_idx:ending_idx]
        surrounding_well_list.remove(well_label)

        if quad:
            surrounding_well_list = list(map(lambda _: self.convert_from_quad(quad, _), surrounding_well_list))

        surrounding_wells = filter(None, [self.wells_dict.get(x, None) for x in surrounding_well_list])
        return surrounding_wells

    def crosstalk_annotator(self, well_label, color, max_capillary_distance=2, idx_dist=1):
        surrounding_wells = self.surrounding_wells(well_label, distance=max_capillary_distance)
        surrounding_signal = [x.channels_dict[color].data for x in surrounding_wells]
        return annotate_signal_crosstalk(surrounding_signal, idx_dist)

    def annotate_crosstalk(self, well_labels=None, max_capillary_distance=2, idx_dist=1):
        """
        Annotate crosstalk between wells.  Peaks must have been already identified and annotated.
        :param well_labels: Well identifier. Optional. If not given, calculates crosstalk for every well.
        :param max_capillary_distance: distance from given well to search for crosstalk
        :return:
        """
        if well_labels is None:
            well_labels = []

        if not well_labels:
            well_labels = self.well_list[self.well_arrangement]

        for well_label in well_labels:
            surrounding_wells = self.surrounding_wells(well_label, distance=max_capillary_distance)
            well = self.wells_dict[well_label]
            for color in list(well.channels_dict):
                surrounding_signal = [x.channels_dict[color].data for x in surrounding_wells]
                crosstalk_annotator = annotate_signal_crosstalk(surrounding_signal, idx_dist)
                self.exec_pre_annotating_function(crosstalk_annotator, [well_label], [color])
        return self

    def annotate_bleedthrough(self, well_labels=None, colors=None, idx_dist=1):
        if not well_labels:
            well_labels = self.well_list[self.well_arrangement]

        for well_label in well_labels:
            well = self.wells_dict.get(well_label, None)
            if well:
                well.annotate_bleedthrough(colors, idx_dist)
        return self

    def calculate_base_sizes(self, ladder, color, base_size_precision=2, sq_limit=1, filter_parameters=None,
                             scanning_parameters=None):
        if filter_parameters is None:
            filter_parameters = {}
        if scanning_parameters is None:
            scanning_parameters = {}

        for well in self.wells_dict.values():
            socketio.sleep()
            well.calculate_base_sizes(ladder=ladder, color=color, base_size_precision=base_size_precision,
                                      sq_limit=sq_limit, filter_parameters=filter_parameters,
                                      scanning_parameters=scanning_parameters)

        return self

    def identify_peak_indices(self, colors=None, **tuning_params):
        if colors is None:
            colors = []

        for well in self.wells_dict.values():
            well.identify_peak_indices(colors, **tuning_params)
        return self

    def static_pre_annotate_peaks(self, well_labels=None, colors=None, annotators=None):
        if annotators is None:
            annotators = []

        if colors is None:
            colors = []

        if well_labels is None:
            well_labels = []

        if not well_labels:
            well_labels = self.well_list[self.well_arrangement]
        for well_label in well_labels:
            well = self.wells_dict.get(well_label, None)
            if well:
                well.static_pre_annotate_peaks(colors, annotators)
        return self

    def static_post_annotate_peaks(self, well_labels=None, colors=None, annotators=None):
        if annotators is None:
            annotators = []

        if colors is None:
            colors = []

        if well_labels is None:
            well_labels = []

        if not well_labels:
            well_labels = self.well_list[self.well_arrangement]
        for well_label in well_labels:
            well = self.wells_dict.get(well_label, None)
            if well:
                well.static_post_annotate_peaks(colors, annotators)
        return self

    def exec_pre_annotating_function(self, fn, well_labels=None, colors=None):
        if colors is None:
            colors = []

        if well_labels is None:
            well_labels = []

        if not well_labels:
            well_labels = self.well_list[self.well_arrangement]
        for well_label in well_labels:
            well = self.wells_dict.get(well_label, None)
            if well:
                well.exec_pre_annotating_function(fn, colors)
        return self

    def exec_post_annotating_function(self, fn, well_labels=None, colors=None):
        if colors is None:
            colors = []

        if well_labels is None:
            well_labels = []

        if not well_labels:
            well_labels = self.well_list[self.well_arrangement]
        for well_label in well_labels:
            well = self.wells_dict.get(well_label, None)
            if well:
                well.exec_post_annotating_function(fn, colors)
        return self

    def exec_peak_filter_function(self, fn, well_labels=None, colors=None):
        if well_labels is None:
            well_labels = []
        if colors is None:
            colors = []
        if not well_labels:
            well_labels = self.well_list[self.well_arrangement]
        for well_label in well_labels:
            well = self.wells_dict.get(well_label, None)
            if well:
                well.exce_peak_filter_function(fn, colors)
        return self


class WellExtractor(object):
    def __init__(self, well_label, plate=None, comments=None, base_sizes=None, sizing_quality=None,
                 offscale_indices=None, ladder_peak_indices=None, channels=None, fsa_hash=None):
        self._channels_dict = None

        if offscale_indices is None:
            offscale_indices = []

        if channels is None:
            channels = []

        if ladder_peak_indices is None:
            ladder_peak_indices = []

        if base_sizes is None:
            base_sizes = []

        if plate:
            self.plate = plate

        self.well_label = well_label
        self.comments = comments
        self.base_sizes = base_sizes
        self.ladder_peak_indices = ladder_peak_indices
        self.sizing_quality = sizing_quality
        self.offscale_indices = offscale_indices

        if channels:
            self.channels = channels
            for channel in channels:
                if not hasattr(channel, 'well'):
                    channel.well = self

        self.fsa_hash = fsa_hash

        self.static_pre_annotators = {
            'peak_size': self.base_size_annotator(),
        }

        self.static_post_annotators = {
            'offscale': self.offscale_annotator(),
        }

    @property
    def channels_dict(self):
        if not self._channels_dict:
            self._channels_dict = {channel.color: channel for channel in self.channels}
        return self._channels_dict

    def __repr__(self):
        if self.sizing_quality:
            return "<Well {0} {1}>".format(self.well_label, round(self.sizing_quality, 2))
        else:
            return "<Well {0}>".format(self.well_label)

    @classmethod
    def from_fsa(cls, fsa):
        """
        Load a well from an FSA file.
        :param fsa: path string, file, or FSAFile
        :return:
        """
        if isinstance(fsa, str):
            with open(fsa, 'r') as f:
                fsa = FSAFile(f.read())
        elif isinstance(fsa, IOBase):
            fsa = FSAFile(fsa.read())

        if isinstance(fsa, FSAFile):
            channels = [ChannelExtractor(**c) for c in fsa.channels]
            return cls(well_label=fsa.well, channels=channels, fsa_hash=fsa.hash, offscale_indices=fsa.offscale_indices)
        else:
            raise AttributeError("FSA File Not Valid.")

    def base_size_annotator(self):
        if self.base_sizes:
            return annotate_base_size(self.base_sizes)
        else:
            return fake_pre_annotation()

    def annotate_bleedthrough(self, colors=None, idx_dist=1):
        if not colors:
            colors = list(self.channels_dict)
        for color in colors:
            channel = self.channels_dict[color]
            channel.annotate_bleedthrough(idx_dist)
        return self

    def bleedthrough_annotator(self, color, idx_dist=1):
        """
        Annotate peak bleedthrough between channels.  Peaks must have been already identified and annotated.
        :param color: color of channel to annotate.
        :return: None
        """

        other_colors = list(self.channels_dict)
        other_colors.remove(color)
        other_traces = [self.channels_dict[c].data for c in other_colors]
        return annotate_signal_crosstalk(other_traces, idx_dist, label='bleedthrough_ratio')

    def offscale_annotator(self):
        return annotate_member_of('peak_index', 'offscale', self.offscale_indices)

    def static_pre_annotate_peaks(self, colors=None, annotators=None):
        if annotators is None:
            annotators = []

        if colors is None:
            colors = []

        if not annotators:
            temp_annotators = list(self.static_pre_annotators)
        else:
            temp_annotators = annotators

        if not colors:
            colors = list(self.channels_dict)

        for annotator in temp_annotators:
            annotator = self.static_pre_annotators.get(annotator, None)
            if annotator:
                self.exec_pre_annotating_function(annotator, colors)

        for color in colors:
            channel = self.channels_dict[color]
            channel.static_pre_annotate_peaks(annotators)
        return self

    def static_post_annotate_peaks(self, colors=None, annotators=None):
        if colors is None:
            colors = []

        if annotators is None:
            annotators = []

        if not annotators:
            temp_annotators = list(self.static_post_annotators)
        else:
            temp_annotators = annotators

        if not colors:
            colors = list(self.channels_dict)

        for annotator in temp_annotators:
            annotator = self.static_post_annotators.get(annotator, None)
            if annotator:
                self.exec_post_annotating_function(annotator, colors)

        for color in colors:
            channel = self.channels_dict[color]
            channel.static_post_annotate_peaks(annotators)
        return self

    def exec_pre_annotating_function(self, fn, colors=None):
        if colors is None:
            colors = []

        if not colors:
            colors = list(self.channels_dict)
        for color in colors:
            channel = self.channels_dict[color]
            channel.pre_annotate_peak_indices(fn)
        return self

    def exec_post_annotating_function(self, fn, colors=None):
        if colors is None:
            colors = []

        if not colors:
            colors = list(self.channels_dict)
        for color in colors:
            channel = self.channels_dict[color]
            channel.post_annotate_peak_indices(fn)
        return self

    def exec_peak_filter_function(self, fn, colors=None):
        if colors is None:
            colors = []

        if not colors:
            colors = list(self.channels_dict)
        for color in colors:
            channel = self.channels_dict[color]
            channel.filter_annotated_peaks(fn)
        return self

    def calculate_base_sizes(self, ladder, color, peak_indices=None, base_size_precision=2, sq_limit=1,
                             filter_parameters=None, scanning_parameters=None):
        """
        Interpolate base sizes by using peaks found in ladder channel.  Sets base_size and sizing_quality params.
        :param ladder: List of expected peak base sizes
        :param color: Color of channel containing ladder
        :param base_size_precision: Digits after decimal to be stored.
        :param sq_limit:
        :param filter_parameters: Dict containing tuning params that modify how peaks are identified and
               base sizes are interpolated
        :param scanning_parameters:
        :return:
        """
        if scanning_parameters is None:
            scanning_parameters = {}

        if filter_parameters is None:
            filter_parameters = {}

        bleedthrough_channels = list(self.channels_dict.values())
        ladder_channel = self.channels_dict[color]

        bleedthrough_channels.remove(ladder_channel)

        processed_ladder = LadderProcessor(channel=ladder_channel, ladder=ladder, sq_limit=sq_limit,
                                           base_size_precision=base_size_precision, filter_parameters=filter_parameters,
                                           scanning_parameters=scanning_parameters,
                                           bleedthrough_channels=bleedthrough_channels)
        try:
            self.base_sizes = processed_ladder.get_base_sizes(peak_indices=peak_indices)
            self.sizing_quality = processed_ladder.sizing_quality
            self.ladder_peak_indices = list(map(int, processed_ladder.peaks))
            self.static_pre_annotators['base_size'] = self.base_size_annotator()
            ladder_channel.set_peak_indices(processed_ladder.peaks)
        except NoLadderException:
            self.sizing_quality = 1000

        return self

    def identify_peak_indices(self, colors=None, **tuning_params):
        if colors is None:
            colors = []
        if not colors:
            colors = list(self.channels_dict)

        for c in colors:
            channel = self.channels_dict[c]
            channel.identify_peak_indices(**tuning_params)
        return self


class ChannelExtractor(object):
    def __init__(self, color, wavelength, well=None, data=None, peak_indices=None, peaks=None):
        # Prevent data being automatically loaded from db during init
        if data:
            self.data = list(data)
        if well:
            self.well = well
        self.color = color
        self.wavelength = wavelength
        self.peak_indices = peak_indices
        self.peaks = peaks

    def __repr__(self):
        return "<Channel {0} {1}>".format(self.color, self.wavelength)

    def annotate_bleedthrough(self, idx_dist=1):
        bleedthrough_annotator = self.well.bleedthrough_annotator(color=self.color, idx_dist=idx_dist)
        self.pre_annotate_peak_indices(bleedthrough_annotator)
        return self

    def annotate_crosstalk(self, max_capillary_distance=2, idx_dist=1):
        crosstalk_annotator = self.well.plate.crosstalk_annotator(well_label=self.well.well_label, color=self.color,
                                                                  max_capillary_distance=max_capillary_distance,
                                                                  idx_dist=idx_dist)
        self.pre_annotate_peak_indices(crosstalk_annotator)
        return self

    def set_peak_indices(self, peak_indices=None):
        if peak_indices is None:
            peak_indices = []
        self.peak_indices = peak_indices
        self.peaks = [{'peak_index': peak_idx} for peak_idx in self.peak_indices]

    def annotate_base_sizes(self):
        base_size_annotator = self.well.base_size_annotator()
        self.pre_annotate_peak_indices(base_size_annotator)
        return self

    def identify_peak_indices(self, scanning_parameters=None):
        """
        Search the trace for peaks using a peak processing algorithm configured with scanning_parameters and set
        peak_indices to the returned indices.
        """
        if scanning_parameters is None:
            scanning_parameters = {}

        ms_processor = MicrosatelliteProcessor(self, scanning_parameters)
        self.set_peak_indices(ms_processor.find_peaks())
        return self

    def annotate_peak_heights(self):
        self.pre_annotate_peak_indices(annotate_peak_height())

    def annotate_relative_peak_heights(self):
        self.post_annotate_peak_indices(annotate_relative_peak_height())

    def annotate_peak_area(self):
        self.pre_annotate_peak_indices(annotate_peak_area(self.data))

    def annotate_relative_peak_area(self):
        self.post_annotate_peak_indices(annotate_relative_peak_area())

    def pre_annotate_peak_indices(self, peak_annotating_fn):
        """
        Updates peaks to list of dicts containing peak annotations.  Annotating functions rely only on the peak index
        and trace data and order in which they are applied should not matter. Order in which peak indices
        are processed is not guaranteed due to parallelized implementations (Not yet implemented).
        :param peak_annotating_fn: function with following signature: f(data, peak_index)
        and returns dict of peak annotation of the form

            {
                'annotation1': value1,
                'annotation2': value2
            }

        that is then used to update the preceding peak annotation.
        :return:
        """
        if self.peaks:
            for annotated_peak in self.peaks:
                annotation_update = peak_annotating_fn(self.data, annotated_peak['peak_index'])
                annotated_peak.update(annotation_update)
        return self

    def post_annotate_peak_indices(self, peak_annotating_fn):
        """
        Annotating function relies on previous annotations. Functions will be applied after pre_annotating functions.
        Functions alter peak annotations in place.
        :param peak_annotating_fn: function with following signature: f(peak_annotations)
        Function returns updated peak_indices
        :return:
        """
        self.peaks = peak_annotating_fn(self.peaks)
        return self

    def filter_annotated_peaks(self, filter_fn):
        """
        Apply peak filtering functions to annotated peaks. Functions are applied in order in which they are passed in.
        :param filter_fn: function that returns filtered annotated peak indices
        :return:
        """
        self.peaks = list(filter_fn(self.peaks))
        return self
