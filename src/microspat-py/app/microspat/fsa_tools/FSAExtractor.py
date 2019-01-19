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

import csv
import datetime
import hashlib
import struct
from collections import defaultdict


def Byte(byte_stream, size):
    return byte_stream[:size]


def Char(byte_stream, size):
    return struct.unpack('>' + str(size) + 'c', byte_stream[:size])


def Word(byte_stream, size):
    if size % 2 == 0:
        return struct.unpack('>' + str(size // 2) + 'H', byte_stream[:size])
    else:
        raise IOError('Bytestream not multiple of 2')


def Short(byte_stream, size):
    if size % 2 == 0:
        return struct.unpack('>' + str(size // 2) + 'h', byte_stream[:size])
    else:
        raise IOError('Bytestream not multiple of 2')


def Long(byte_stream, size):
    if size % 4 == 0:
        return struct.unpack('>' + str(size // 4) + 'l', byte_stream[:size])
    else:
        raise IOError('ByteStream not multiple of 4')


def Float(byte_stream, size):
    if size % 4 == 0:
        return struct.unpack('>' + str(size // 4) + 'f', byte_stream[:size])
    else:
        raise IOError('ByteStream not multiple of 4')


def Double(byte_stream, size):
    if size % 8 == 0:
        return struct.unpack('>' + str(size // 8) + 'd', byte_stream[:size])
    else:
        raise IOError('Bytestream not multiple of 8')


def Date(byte_stream, size):
    if size == 4:
        return struct.unpack('>hBB', byte_stream[:size])
    else:
        raise IOError('ByteStream not length of 4')


def Time(byte_stream, size):
    if size == 4:
        return struct.unpack('>BBBB', byte_stream[:size])
    else:
        raise IOError('ByteStream not length of 4')


def pString(byte_stream, size):
    return struct.unpack('>' + str(size) + 'p', byte_stream[:size])


def cString(byte_stream, size):
    return struct.unpack('>' + str(size) + 's', byte_stream[:size])


def Thumb(byte_stream, size):
    if size == 10:
        return struct.unpack('>iiBB', byte_stream[:size])
    else:
        raise IOError('Bytestream not length of 10')


def Bool(byte_stream, size):
    return struct.unpack('>' + str(size) + '?', byte_stream[:size])


def User(byte_stream, size):
    return byte_stream[:size]


structUnpacker = {1: Byte,
                  2: Char,
                  3: Word,
                  4: Short,
                  5: Long,
                  7: Float,
                  8: Double,
                  10: Date,
                  11: Time,
                  18: pString,
                  19: cString,
                  12: Thumb,
                  13: Bool,
                  0: User}


class FSAFile(object):
    SIGNATURE = b"ABIF"

    def __init__(self, byte_stream, malform_check=True):
        self._channels = {}
        self.raw = byte_stream
        self.signature = struct.unpack('>4s', byte_stream[0:4])[0]
        self.version = struct.unpack('>h', byte_stream[4:6])[0]
        self._channels = None
        self._hash = None

        if self.signature != FSAFile.SIGNATURE:
            raise IOError('WARNING: Not a valid ABIF File.')

        self.tdir = FSADir(byte_stream, offset=6)

        self.directories = defaultdict(dict)

        # Unpack FSA File.
        for i in range(0, self.tdir.numElements):
            directory = FSADir(byte_stream, self.tdir.dataOffset + i * 28)
            self.directories[directory.name][directory.number] = directory

        if malform_check:
            for k in ['DyeW', 'DATA']:
                if k not in self.directories:
                    raise IOError("ABIF Malformed")

    def dump_to_csv(self, filename):
        with open(filename, 'w') as f:
            w = csv.writer(f)
            for dir_key in self.directories:
                directory = self.directories[dir_key]
                for entry_key in directory:
                    row = [dir_key, entry_key]
                    row += list(directory[entry_key].data)
                    w.writerow(row)

    def _compute_hash(self):
        return hashlib.md5(self.raw).hexdigest()

    @property
    def hash(self):
        if not self._hash:
            self._hash = self._compute_hash()
        return self._hash

    @property
    def channels(self):
        if not self._channels:
            # Colors ordered so that as they are popped off they match the given channel.
            colors = ['orange', 'red', 'yellow', 'green', 'blue']
            wavelength_keys = list(self.directories['DyeW'])
            # Backwards compatibility of FSA files requires that the 5th channel, if used, is labeled
            # as 105 in the data directory.
            if len(wavelength_keys) == 5:
                data_keys = [1, 2, 3, 4, 105]
            else:
                data_keys = sorted(wavelength_keys)
            self._channels = [{'data': self.directories['DATA'][data_keys[k]].data,
                               'wavelength': self.directories['DyeW'][wavelength_keys[k]].data[0],
                               'color': colors.pop()
                               } for k in range(len(wavelength_keys))]
        return self._channels

    @property
    def sample_name(self):
        # Sample Label
        return self.directories['SpNm'][1].data[0].decode('ascii')

    @property
    def plate(self):
        # Plate Label
        return self.directories['CTID'][1].data[0].replace(b"\x00", b"").decode('ascii')

    @property
    def well(self):
        well = self.directories['TUBE'][1].data[0].decode('ascii')
        # Normalize well label so that integer portion is zero-padded.
        if int(well[1:]) < 10:
            well_letter = well[0]
            well_integer = well[1]
            well = f'{well_letter}0{well_integer}'
        return well

    @property
    def date_run(self):
        date = datetime.datetime(*(sum((self.directories['RUND'][1].data, self.directories['RUNT'][1].data), ())))
        return date

    @property
    def ce_machine(self):
        # Name of CE machine on which the plate was run.
        ce_machine = self.directories['MCHN'][1].data[0].decode('ascii')
        return ce_machine

    @property
    def plate_size(self):
        # Size of the plate, either 384 or 96.
        plate_size = self.directories['PSZE'][1].data[0]
        return plate_size

    @property
    def offscale_indices(self):
        # Indices of data points detected by the machine where the signal is saturated.
        if 'Satd' in self.directories:
            offscale_indices = list(self.directories['Satd'][1].data)
        else:
            offscale_indices = []
        return offscale_indices

    @property
    def polymer_expiration(self):
        exp_date = datetime.datetime.strptime(self.directories['SMED'][1].data[0], '%b %d, %Y')
        return exp_date

    @property
    def polymer_lot_number(self):
        lot_num = int(self.directories['SMLt'][1].data[0])
        return lot_num

    @property
    def voltage(self):
        voltage = list(self.directories['DATA'][5].data)
        return voltage

    @property
    def current(self):
        current = list(self.directories['DATA'][6].data)
        return current

    @property
    def power(self):
        power = list(self.directories['DATA'][7].data)
        return power

    @property
    def temperature(self):
        temperature = list(self.directories['DATA'][8].data)
        return temperature


class FSADir(object):
    """
    Given a full bytestream and an offset, unpack the directory found within an FSA file.
    """
    def __init__(self, bytestream, offset):
        self.name = struct.unpack('>4s', bytestream[offset: offset + 4])[0].decode('ascii')
        self.number = struct.unpack('>i', bytestream[offset + 4: offset + 8])[0]
        self.elementType = struct.unpack('>h', bytestream[offset + 8: offset + 10])[0]
        self.elementSize = struct.unpack('>h', bytestream[offset + 10: offset + 12])[0]
        self.numElements = struct.unpack('>i', bytestream[offset + 12: offset + 16])[0]
        self.dataSize = struct.unpack('>i', bytestream[offset + 16: offset + 20])[0]
        self.dataOffset = struct.unpack('>i', bytestream[offset + 20: offset + 24])[0]
        self.dataHandle = struct.unpack('>i', bytestream[offset + 24: offset + 28])[0]
        if self.dataSize > 4:
            self.data = structUnpacker.get(self.elementType, User)(bytestream[self.dataOffset:], self.dataSize)
        else:
            self.data = structUnpacker.get(self.elementType, User)(bytestream[offset + 20: offset + 24], self.dataSize)

    def __repr__(self):
        if len(self.data) > 25:
            return '<ABIF entry: {}, data: "{}">'.format(str(self.name) + str(self.number), str(self.data[0:25]) + "...")
        else:
            return '<ABIF entry: {}, data: "{}">'.format(str(self.name) + str(self.number), str(self.data[0:25]))
