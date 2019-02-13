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

import os
import logging


# Define the application directory
version = '2.0.1'
major_version = version.split('.')[0]

app_dir = 'com.greenhouse.microspat'
major_version_dir = 'v' + major_version
basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
prod_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))

# Enable protection agains *Cross-site Request Forgery (CSRF)*
CSRF_ENABLED = True

if os.sys.platform == 'darwin':
    APPDATA = os.path.join(os.environ.get('HOME'), 'Library', 'Application Support', app_dir, major_version_dir)
elif os.sys.platform == 'win32':
    APPDATA = os.path.join(os.environ.get('LOCALAPPDATA'), app_dir, major_version_dir)

if not os.path.exists(APPDATA):
    os.makedirs(APPDATA)


class Config:
    VERSION = version
    MAJOR_VERSION = major_version

    DEBUG = False
    SECRET_KEY = os.environ.get('SECRET_KEY') or "secret"
    SQLALCHEMY_COMMIT_ON_TEARDOWN = True
    SQLALCHEMY_RECORD_QUERIES = False
    SQLALCHEMY_TRACK_MODIFICATIONS = False

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
    SQLALCHEMY_ECHO = True  # Echo SQL to the console

    DEBUG = True
    SQLALCHEMY_RECORD_QUERIES = True
    SQLALCHEMY_TRACK_MODIFICATIONS = True

    ASSETS_PATH = os.path.join(basedir, 'static')
    DB_PATH = os.path.join(basedir, 'dev_microspat_db.sqlite')

    LOGGING_LOCATION = os.path.join(APPDATA, 'microspat_dev.log')

    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///' + DB_PATH

    LOGGING_LOCATION = os.path.join(basedir, 'app.log')
    LOGGING_LEVEL = logging.DEBUG


class ProductionConfig(Config):

    ASSETS_PATH = os.path.join(prod_dir, 'static')
    DB_PATH = os.path.join(APPDATA, 'microspat_db.sqlite')

    LOGGING_LOCATION = os.path.join(APPDATA, 'microspat.log')

    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///' + DB_PATH

    LOGGING_LOCATION = os.path.join(APPDATA, 'app.log')
    LOGGING_LEVEL = logging.ERROR

    @classmethod
    def init_app(cls, app):
        Config.init_app(app)


config = {
    'production': ProductionConfig,
    'development': DevelopmentConfig,
    'default': ProductionConfig
}
