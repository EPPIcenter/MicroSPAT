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


# from celery import Celery
from flask import Flask
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy

from config import config


db = SQLAlchemy()
socketio = SocketIO()
# celery = Celery()
# ma = Marshmallow()


def create_app(config_name):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)

    socketio.init_app(app)
    app.logger.debug("SocketIO Initialized")

    db.app = app
    db.init_app(app)

    # ma.app = app
    # ma.init_app(app)

    # celery.name = __name__
    # celery.conf.update(app.config)

    # celery.conf.update(app.config)

    from app.events import plasmotrack
    app.register_blueprint(plasmotrack)
    app.logger.debug("PlasmoTrack Initialized")

    from app.microspat.events import microspat
    app.register_blueprint(microspat)
    app.logger.debug("MicroSPAT Initialized")

    db.create_all()

    # configure_uploads(app, (plate_zips,))

    return app
