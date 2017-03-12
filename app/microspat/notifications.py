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

from flask_socketio import emit
from app import socketio
from models import *
from sqlalchemy import event


@event.listens_for(db.Model, 'after_update', propagate=True)
def broadcast_update(mapper, connection, target):
    if Config.NOTIFICATIONS:
        socketio.emit('update', {
            'type': target.__class__.__name__,
            'id': target.id
        })


@event.listens_for(db.Model, 'after_delete', propagate=True)
def broadcast_delete(mapper, connection, target):
    # if Config.NOTIFICATIONS:
    socketio.emit('delete_item', {
        'type': target.__class__.__name__,
        'id': target.id
    })