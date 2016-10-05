import { Injectable } from '@angular/core';
import { SERVER_BASE, API_BASE } from '../../api';
import { CommonServerMethods } from '../utils/ServerMethods';

@Injectable()
export class NotificationService {
    protected _socket: SocketIOClient.Socket;
    
    constructor (protected _commonServerMethods: CommonServerMethods) {
        this._socket = io(SERVER_BASE);
        
        console.log("Creating NotificationService");
        
        this._socket.on('message', msg => {
            toastr.success(msg);
        })
    }
}