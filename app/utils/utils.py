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

class CaseInsensitiveDict(dict):
    """
    Dict that removes whitespace, replaces inner spaces with underscores, removes periods, and is
    case insensitive.
    """

    def __getitem__(self, item):
        return dict.__getitem__(self, item.strip().replace(' ', '_').replace('.', '').lower())


class CaseInsensitiveDictReader(csv.DictReader, object):
    """
    DictReader that uses case insensitive dict, removes periods, and converts fieldnames to snake_case
    """

    @property
    def fieldnames(self):
        return [field.strip()
                     .replace(' ', '_')
                     .replace('.', '')
                     .lower()
                for field in super(CaseInsensitiveDictReader, self).fieldnames]

    def __next__(self):
        d_insensitive = CaseInsensitiveDict()
        d_original = super(CaseInsensitiveDictReader, self).__next__()

        for k, v in d_original.items():
            d_insensitive[k] = v

        return d_insensitive
