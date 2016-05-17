from flask import Blueprint, send_from_directory, redirect
from werkzeug.exceptions import NotFound
from flask.helpers import safe_join

plasmotrack = Blueprint('plasmotrack', import_name=__name__, static_folder='static/plasmotrack-js')


@plasmotrack.route('/<path:path>')
def catch_all(path):
    try:
        return send_from_directory(plasmotrack.static_folder, path)
    except NotFound:
        return redirect("/")


@plasmotrack.route('/')
def index():
    return plasmotrack.send_static_file('index.html')

