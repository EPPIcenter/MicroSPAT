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

from sqlalchemy.orm.exc import NoResultFound

from app.microspat.fsa_tools.PlateExtractor import ExtractedPlate


def load_plate_zips(zips, ladder):
    extracted_plates = []
    # if parallel:
    #     extracted_plates = PlateExtractor.parallel_from_zip(zips, ladder=ladder.base_sizes, color=ladder.color,
    #                                                         base_size_precision=ladder.base_size_precision,
    #                                                         sq_limit=ladder.sq_limit,
    #                                                         filter_parameters=ladder.filter_parameters,
    #                                                         scanning_parameters=ladder.scanning_parameters)
    # else:
    for z in zips:
        extracted_plate = ExtractedPlate.from_zip_and_calculate_base_sizes(z, ladder=ladder.base_sizes,
                                                                           color=ladder.color,
                                                                           base_size_precision=ladder.base_size_precision,
                                                                           sq_limit=ladder.sq_limit,
                                                                           filter_parameters=ladder.filter_parameters,
                                                                           scanning_parameters=ladder.scanning_parameters)
        extracted_plates.append(extracted_plate)
    return extracted_plates





