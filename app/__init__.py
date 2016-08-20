# from celery import Celery
from flask import Flask
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy

from config import config


db = SQLAlchemy()
socketio = SocketIO()
# celery = Celery(__name__, broker=Config.CELERY_BROKER_URL)


def create_app(config_name):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)

    socketio.init_app(app)
    app.logger.debug("SocketIO Initialized")

    db.app = app
    db.init_app(app)

    # celery.conf.update(app.config)

    from app.events import plasmotrack
    app.register_blueprint(plasmotrack)
    app.logger.debug("PlasmoTrack Initialized")

    from app.microspat.events import microspat
    app.register_blueprint(microspat)
    app.logger.debug("PlasmoMapper Initialized")

    db.create_all()

    # configure_uploads(app, (plate_zips,))

    return app
