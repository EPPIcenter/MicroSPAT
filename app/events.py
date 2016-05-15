from flask import Blueprint, send_from_directory

plasmotrack = Blueprint('plasmotrack', import_name=__name__, static_folder='static')


@plasmotrack.route('/<path:path>')
def catch_all(path):
    return send_from_directory('static/plasmotrack-js', path)


@plasmotrack.route('/')
def index():
    return plasmotrack.send_static_file('plasmotrack-js/index.html')
