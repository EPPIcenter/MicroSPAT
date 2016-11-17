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

import bz2
import json

import sqlalchemy.types as types
from sqlalchemy.ext.mutable import Mutable


class JSONEncodedData(types.TypeDecorator):
    impl = types.Text

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = json.loads(value)
        return value


class CompressedJSONEncodedData(types.TypeDecorator):
    impl = types.LargeBinary

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = bz2.compress(json.dumps(value))
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = json.loads(bz2.decompress(value))
        return value


class MutableDict(Mutable, dict):

    @classmethod
    def coerce(cls, key, value):
        if not isinstance(value, MutableDict):
            if isinstance(value, dict):
                return MutableDict(value)
            return MutableDict(key, value)
        else:
            return value

    def __setitem__(self, key, value):
        dict.__setitem__(self, key, value)
        self.changed()

    def __delitem__(self, key):
        dict.__delitem__(self, key)
        self.changed()


# class MutableList(Mutable, list):
#
#     @classmethod
#     def coerce(cls, key, value):
#         if not isinstance(value, MutableList):
#             if isinstance(value, list):
#                 return MutableList(value)
#             return MutableList(key, value)
#         else:
#             return value
#
#     def changed(self):
#         print "LIST CHANGED"
#         super(MutableList, self).changed()
#
#     def __add__(self, other):
#         list.__add__(self, other)
#         self.changed()
#
#     def __iadd__(self, other):
#         list.__iadd__(self, other)
#         self.changed()
#
#     def __imul__(self, other):
#         list.__imul__(self, other)
#         self.changed()
#
#     def __delitem__(self, key):
#         list.__delitem__(self, key)
#         self.changed()
#
#     def __delslice__(self, i, j):
#         list.__delslice__(self, i, j)
#         self.changed()
#
#     def __setitem__(self, key, value):
#         list.__setitem__(self, key, value)
#         self.changed()
#
#     def __setslice__(self, i, j, sequence):
#         list.__setslice__(self, i, j, sequence)
#         self.changed()

class MutableList(Mutable, list):
    """
    SQLAlchemy implementation

    A list type that implements :class:`.Mutable`.
    The :class:`.MutableList` object implements a list that will
    emit change events to the underlying mapping when the contents of
    the list are altered, including when values are added or removed.
    Note that :class:`.MutableList` does **not** apply mutable tracking to  the
    *values themselves* inside the list. Therefore it is not a sufficient
    solution for the use case of tracking deep changes to a *recursive*
    mutable structure, such as a JSON structure.  To support this use case,
    build a subclass of  :class:`.MutableList` that provides appropriate
    coersion to the values placed in the dictionary so that they too are
    "mutable", and emit events up to their parent structure.
    .. versionadded:: 1.1
    .. seealso::
        :class:`.MutableDict`
        :class:`.MutableSet`
    """

    def __setitem__(self, index, value):
        """Detect list set events and emit change events."""
        list.__setitem__(self, index, value)
        self.changed()

    def __setslice__(self, start, end, value):
        """Detect list set events and emit change events."""
        list.__setslice__(self, start, end, value)
        self.changed()

    def __delitem__(self, index):
        """Detect list del events and emit change events."""
        list.__delitem__(self, index)
        self.changed()

    def __delslice__(self, start, end):
        """Detect list del events and emit change events."""
        list.__delslice__(self, start, end)
        self.changed()

    def pop(self, *arg):
        result = list.pop(self, *arg)
        self.changed()
        return result

    def append(self, x):
        list.append(self, x)
        self.changed()

    def extend(self, x):
        list.extend(self, x)
        self.changed()

    def insert(self, i, x):
        list.insert(self, i, x)
        self.changed()

    def remove(self, i):
        list.remove(self, i)
        self.changed()

    def sort(self, **kwargs):
        list.sort(self, **kwargs)
        self.changed()

    def reverse(self):
        list.reverse(self)
        self.changed()

    @classmethod
    def coerce(cls, index, value):
        """Convert plain list to instance of this class."""
        if not isinstance(value, cls):
            if isinstance(value, list):
                return cls(value)
            return Mutable.coerce(index, value)
        else:
            return value

    def __getstate__(self):
        return list(self)

    def __setstate__(self, state):
        self[:] = state