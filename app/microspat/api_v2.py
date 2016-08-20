from flask_socketio import emit
from app import socketio
from models import *
from flask import Blueprint, render_template, jsonify, request, Response
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

import eventlet

plasmomapper = Blueprint('plasmomapper_v2', import_name=__name__, template_folder='templates',
                         url_prefix='/plasmomapper/api/v2')


@plasmomapper.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


@plasmomapper.route('/', defaults={'path': ''})
@plasmomapper.route('/<path:path>')
def catch_all(path):
    res = jsonify(error='Not Found')
    res.status_code = 404
    return res


@plasmomapper.route('/genotyping-project/', methods=['GET'])
def list_genotyping_projects():
    pass


@plasmomapper.route('/genotyping-project/', methods=['POST'])
def create_genotyping_project():
    pass


@plasmomapper.route('/genotyping-project/<int:id>/', methods=['GET'])
def get_genotyping_project(id):
    pass


@plasmomapper.route('/genotyping-project/<int:id>/', methods=['PUT'])
def update_genotyping_project(id):
    pass


@plasmomapper.route('/genotyping-project/<int:id>/', methods=['DELETE'])
def delete_genotyping_project(id):
    pass


@plasmomapper.route('/genotyping-project/<int:id>/channel-annotations/', methods=['GET'])
def get_project_channel_annotations(id):
    pass


@plasmomapper.route('/genotyping-project/<int:id>/sample-annotations/', methods=['GET'])
def get_project_sample_annotations(id):
    pass


@plasmomapper.route('/genotyping-project/<int:id>/calculate-probability/', methods=['PUT'])
def calculate_peak_probability(id):
    pass


@plasmomapper.route('/genotyping-project/<int:id>/add-samples/', methods=['POST'])
def add_samples(id):
    pass


@plasmomapper.route('/artifact-estimator/', methods=['GET'])
def list_artifact_estimator_projects():
    pass


@plasmomapper.route('/artifact-estimator/', methods=['POST'])
def create_artifact_estimator_project():
    pass


@plasmomapper.route('/artifact-estimator/<int:id>/', methods=['GET'])
def get_artifact_estimator_project(id):
    pass


@plasmomapper.route('/artifact-estimator/<int:id>/', methods=['PUT'])
def update_artifact_estimator_project(id):
    pass


@plasmomapper.route('/artifact-estimator/<int:id>/', methods=['DELETE'])
def delete_artifact_estimator_project(id):
    pass


@plasmomapper.route('/bin-estimator/', methods=['GET'])
def list_bin_estimator_projects():
    pass


@plasmomapper.route('/bin-estimator/', methods=['POST'])
def create_bin_estimator_project():
    pass


@plasmomapper.route('/bin-estimator/<int:id>/', methods=['GET'])
def get_bin_estimator_project(id):
    pass


@plasmomapper.route('/bin-estimator/<int:id>/', methods=['PUT'])
def update_bin_estimator_project(id):
    pass


@plasmomapper.route('/bin-estimator/<int:id>/', methods=['DELETE'])
def delete_bin_estimator_project(id):
    pass


@plasmomapper.route('/plate/', methods=['GET'])
def list_plates():
    pass


@plasmomapper.route('/plate/<int:id>/', methods=['GET'])
def get_plate(id):
    pass


@plasmomapper.route('/plate/upload/', methods=['POST'])
def upload_plates():
    pass


@plasmomapper.route('/well/<int:id>/', methods=['GET'])
def get_well(id):
    pass


@plasmomapper.route('/well/<int:id>/recalculate_ladder/', methods=['PUT'])
def recalculate_well_ladder(id):
    pass


@plasmomapper.route('/channel/<int:id>/', methods=['GET'])
def get_channel(id):
    pass


@plasmomapper.route('/locus/', methods=['GET'])
def list_loci():
    pass


@plasmomapper.route('/locus/', methods=['POST'])
def create_locus():
    pass


@plasmomapper.route('/locus/<int:id>/', methods=['GET'])
def get_locus(id):
    pass


@plasmomapper.route('/locus/<int:id>/', methods=['PUT'])
def update_locus(id):
    pass


@plasmomapper.route('/locus/<int:id>/', methods=['DELETE'])
def delete_locus(id):
    pass


@plasmomapper.route('/locus-set/', methods=['GET'])
def list_locus_sets():
    pass


@plasmomapper.route('/locus-set/', methods=['POST'])
def create_locus_set():
    pass


@plasmomapper.route('/locus-set/<int:id>/', methods=['GET'])
def get_locus_set(id):
    pass


@plasmomapper.route('/locus-set/<int:id>/', methods=['DELETE'])
def delete_locus_set(id):
    pass


@plasmomapper.route('/ladder/', methods=['GET'])
def list_ladders():
    pass


@plasmomapper.route('/ladder/', methods=['POST'])
def create_ladder():
    pass


@plasmomapper.route('/ladder/<int:id>/', methods=['GET'])
def get_ladder(id):
    pass


@plasmomapper.route('/ladder/<int:id>/', methods=['PUT'])
def update_ladder(id):
    pass


