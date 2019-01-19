// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { Injectable } from '@angular/core';
import { SERVER_BASE, API_BASE } from '../../api';
import { CommonServerMethods } from '../utils/ServerMethods';

@Injectable()
export class NotificationService {
    protected _socket: SocketIOClient.Socket;
    
    constructor (protected _commonServerMethods: CommonServerMethods) {
        this._socket = io(SERVER_BASE);
        
        this._socket.on('message', msg => {
            toastr.success(msg);
        });

        this._socket.on('notification', msg => {
            toastr[msg.type](msg.msg);
        })
    }
}