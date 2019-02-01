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


import multiprocessing
import argparse
from app import socketio, create_app, db


def run_sockets(mode='production', address='127.0.0.1:17328'):
    app = create_app(mode)
    auto_vacuum()
    host, port = address.split(':')
    port = int(port)
    print("Starting Application")
    socketio.run(app, host=host, port=port)


def auto_vacuum():
    if db.engine.url.drivername == 'sqlite':
        db.engine.execute("PRAGMA auto_vacuum = 2")
        db.engine.execute("PRAGMA incremental_vacuum(10000)")


if __name__ == '__main__':
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", type=str, default="production")
    parser.add_argument("--address", type=str, default="127.0.0.1:17328")
    args = parser.parse_args()
    run_sockets(args.mode, args.address)
