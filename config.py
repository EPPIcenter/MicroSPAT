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
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
                              'sqlite:///' + os.path.join(basedir, 'data-dev.sqlite')

    CELERY_RESULT_BACKEND = os.environ.get('DEV_RESULT_BACKEND_URL') or \
                            'db+sqlite:///' + os.path.join(basedir, 'result-backend-dev.sqlite')
    SQLALCHEMY_ECHO = False
    LOGGING_LEVEL = logging.DEBUG


class ProductionConfig(Config):
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
                              'sqlite:///' + os.path.join(basedir, 'data.sqlite')
    CELERY_RESULT_BACKEND = os.environ.get('RESULT_BACKEND_URL') or \
                            'db+sqlite:///' + os.path.join(basedir, 'result-backend.sqlite')
    LOGGING_LEVEL = logging.ERROR

    @classmethod
    def init_app(cls, app):
        Config.init_app(app)


config = {
    'production': ProductionConfig,
    'development': DevelopmentConfig,
    'default': DevelopmentConfig
}
