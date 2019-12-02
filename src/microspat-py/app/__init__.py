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

from flask import Flask
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy

# pyinstaller imports
from eventlet.hubs import epolls, kqueue, selects
from dns import dnssec, e164, hash, namedict, tsigkeyring, update, version, zone

from config import config



db = SQLAlchemy()
socketio = SocketIO(cors_allowed_origins="*")


def create_app(config_name):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)

    # Increased timeout because this is a desktop app
    socketio.init_app(app, ping_timeout=60000, ping_interval=30000, async_mode='eventlet')
    app.logger.debug("SocketIO Initialized")

    db.app = app
    db.init_app(app)

    from app.microspat.api import microspat
    app.register_blueprint(microspat)
    app.logger.debug("MicroSPAT Initialized")

    from app.microspat.api import microspat_api
    app.register_blueprint(microspat_api)
    app.logger.debug("MicroSPAT API Initialized")

    db.create_all()

    return app
