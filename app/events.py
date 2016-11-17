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

from flask import Blueprint, send_from_directory, redirect
from werkzeug.exceptions import NotFound
from flask.helpers import safe_join

plasmotrack = Blueprint('plasmotrack', import_name=__name__, static_folder='static/plasmotrack-js')


@plasmotrack.route('/<path:path>')
def catch_all(path):
    try:
        return send_from_directory(plasmotrack.static_folder, path)
    except NotFound:
        return redirect("/")


@plasmotrack.route('/')
def index():
    return plasmotrack.send_static_file('index.html')
