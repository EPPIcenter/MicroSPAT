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

from flask import Blueprint, jsonify, send_from_directory, redirect
from werkzeug.exceptions import NotFound
import os

microspat = Blueprint('microspat', __name__,
                      static_folder=os.path.join(
                          os.path.dirname(
                              os.path.dirname(
                                  os.path.dirname(__file__)
                              )
                          ), 'microspat/static')
                      )

microspat_api = Blueprint('microspat_api', import_name=__name__, template_folder='templates',
                          url_prefix='/microspat_api')


@microspat_api.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


@microspat.route('/status')
def check_status():
    return jsonify(status="online", static=microspat.static_folder)


@microspat.route('/<path:path>')
def catch_all(path):
    try:
        return send_from_directory(microspat.static_folder, path)
    except NotFound:
        return redirect("/")


@microspat.route('/')
def index():
    return microspat.send_static_file('index.html')
