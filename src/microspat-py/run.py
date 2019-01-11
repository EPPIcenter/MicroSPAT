#!/usr/bin/env python
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

# import flask as _
# import numpy as __

import multiprocessing
from app import socketio, create_app, db


def run_sockets(address='0.0.0.0:17328'):
    app = create_app('production')
    auto_vacuum()
    host, port = address.split(':')
    port = int(port) or 17328
    print("Starting Application")
    socketio.run(app, host=host, port=port)


def auto_vacuum():
    if db.engine.url.drivername == 'sqlite':
        db.engine.execute("PRAGMA auto_vacuum = 2")
        db.engine.execute("PRAGMA incremental_vacuum(10000)")


if __name__ == '__main__':
    multiprocessing.freeze_support()
    run_sockets()
