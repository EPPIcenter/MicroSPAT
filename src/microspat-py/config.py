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

# Define the application directory
import os
import logging

basedir = os.path.abspath(os.path.dirname(__file__))

# Enable protection agains *Cross-site Request Forgery (CSRF)*
CSRF_ENABLED = True


class Config:
    DEBUG = False
    SECRET_KEY = os.environ.get('SECRET_KEY') or "secret"
    SQLALCHEMY_COMMIT_ON_TEARDOWN = True
    SQLALCHEMY_RECORD_QUERIES = True
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False  # Echo SQL to the console

    # Logging
    LOGGING_LOCATION = "app.log"
    LOGGING_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

    @staticmethod
    def init_app(app):
        handler = logging.FileHandler(app.config['LOGGING_LOCATION'])
        handler.setLevel(app.config['LOGGING_LEVEL'])
        formatter = logging.Formatter(app.config['LOGGING_FORMAT'])
        handler.setFormatter(formatter)
        app.logger.addHandler(handler)


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    if os.name == 'nt':
        SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
                                  'sqlite:///' + os.path.join(basedir, 'win-data-dev.sqlite')

    else:
        SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
                              'sqlite:///' + os.path.join(basedir, 'data-dev.sqlite')


    # SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(basedir, 'data-dev.sqlite')
    # CELERY_RESULT_BACKEND = 'db+sqlite:///' + os.path.join(basedir, 'result-backend-dev.sqlite')


    LOGGING_LEVEL = logging.DEBUG


class ProductionConfig(Config):
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
                              'sqlite:///' + os.path.join(basedir, 'data-dev.sqlite')

    LOGGING_LEVEL = logging.ERROR

    @classmethod
    def init_app(cls, app):
        Config.init_app(app)


config = {
    'production': ProductionConfig,
    'development': DevelopmentConfig,
    'default': ProductionConfig
}
