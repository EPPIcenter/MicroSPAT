# Define the application directory
import os

basedir = os.path.abspath(os.path.dirname(__file__))

# Define the database
# SQLALCHEMY_DATABASE_URI = "postgresql://plasmotrack:plasmotrack@localhost"

# Enable protection agains *Cross-site Request Forgery (CSRF)*
CSRF_ENABLED = True

# Use a secure, unique and absolutely secret key for
# signing the data.


class Config:
    DEBUG = False
    SECRET_KEY = os.environ.get('SECRET_KEY') or "secret"
    CELERY_BROKER_URL = 'amqp://guest:guest@localhost:5672//'
    SQLALCHEMY_COMMIT_ON_TEARDOWN = True
    SQLALCHEMY_RECORD_QUERIES = True

    UPLOADED_PLATES_DEST = os.path.join(basedir, "plate_zips")
    UPLOADED_FSAFILES_DEST = os.path.join(basedir, "temp_fsa_files")
    PICKLED_MODELS = os.path.join(basedir, "pickled_models")

    @staticmethod
    def init_app(app):
        pass


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
                              'sqlite:///' + os.path.join(basedir, 'data-dev.sqlite')

    CELERY_RESULT_BACKEND = os.environ.get('DEV_RESULT_BACKEND_URL') or \
                            'db+sqlite:///' + os.path.join(basedir, 'result-backend-dev.sqlite')
    SQLALCHEMY_ECHO = False


class ProductionConfig(Config):
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
                              'sqlite:///' + os.path.join(basedir, 'data.sqlite')
    CELERY_RESULT_BACKEND = os.environ.get('RESULT_BACKEND_URL') or \
                            'db+sqlite:///' + os.path.join(basedir, 'result-backend.sqlite')

    @classmethod
    def init_app(cls, app):
        Config.init_app(app)

        # email errors to the administrators
        # import logging
        # from logging.handlers import SMTPHandler
        # credentials = None
        # secure = None
        # if getattr(cls, 'MAIL_USERNAME', None) is not None:
        #     credentials = (cls.MAIL_USERNAME, cls.MAIL_PASSWORD)
        #     if getattr(cls, 'MAIL_USE_TLS', None):
        #         secure = ()
        # mail_handler = SMTPHandler(
        #     mailhost=(cls.MAIL_SERVER, cls.MAIL_PORT),
        #     fromaddr=cls.FLASKY_MAIL_SENDER,
        #     toaddrs=[cls.FLASKY_ADMIN],
        #     subject=cls.FLASKY_MAIL_SUBJECT_PREFIX + ' Application Error',
        #     credentials=credentials,
        #     secure=secure)
        # mail_handler.setLevel(logging.ERROR)
        # app.logger.addHandler(mail_handler)

config = {
    'production': ProductionConfig,
    'development': DevelopmentConfig,
    'default': DevelopmentConfig
}
