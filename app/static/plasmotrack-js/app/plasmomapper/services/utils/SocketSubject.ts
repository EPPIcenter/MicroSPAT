import {Observer} from 'rxjs/Observer';
import {Subscriber} from 'rxjs/Subscriber';
import {Observable} from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import * as SocketIOClient from 'socket.io-client';

export class SocketSubject extends Subject<string> {
    private socket: SocketIOClient.Socket
    private url: string;
    private open_observer: Observer<Event>;
    private close_observer: Observer<CloseEvent>;
    
    constructor(url: string, open_observer?: Observer<Event>, close_observer?: Observer<CloseEvent>) {
        super()
        this.url = url;
        this.open_observer = open_observer;
        this.close_observer = close_observer;
        
        this.socket = io(url);
        
        this.socket.on('connect', (event) => this.open_observer.next(event))
        
        this.socket.on('disconnect', (event) => this.close_observer.next(event))
        
        this.destination = Subscriber.create(
            (message: string) => {
                this.socket.send(message);
            },
            (error) => {
                this.socket.close();
                let errorEvent = new ErrorEvent();
                errorEvent.message = "Error in data stream.";
                errorEvent.error = error;
                super.error.call(this, errorEvent);
            },
            () => {
                this.socket.close();
                let closeEvent = new CloseEvent();
                closeEvent.code = 1000;
                closeEvent.reason = "Connection closed by client.";
                closeEvent.wasClean = true;
                this.close_observer.next(closeEvent);
            }
        )
    }
    
    next(value?: string) {
        this.destination.next.call(this.destination, value);
    };
    
    error(err?) {
        this.destination.error.call(this.destination, err);
    }
    
    complete() {
        this.destination.complete.call(this.destination);
    }
    
    
    
    
}

// export class WebSocketSubject extends Subject<string> {
//     private ws: WebSocket;
//     private ws_url: string;
//     private open_observer: Observer<Event>;
//     private close_observer: Observer<CloseEvent>;
    
//     constructor(ws_url: string, protocol: string, open_observer?: Observer<Event>, close_observer?: Observer<Event>) {
//         super();
        
//         this.ws_url = ws_url;
//         this.open_observer = open_observer;
//         this.close_observer = close_observer;
//         this.ws = new WebSocket(ws_url);
        
//         this.ws.onopen = (event) => {
//             this.open_observer.next(event);
//         };
        
//         this.ws.onclose = (event) => {
//             this.close_observer.next(event);
//         };
        
//         this.ws.onmessage = (event) => {
//             try {
//                 super.next.call(this, event.data);
//             } catch (e) {
//                 let error_event = new ErrorEvent();
//                 error_event.message = "Bad event";
//                 error_event.error = e;
//                 super.error.call(this, error_event);
//             }
//         };
        
//         this.ws.onerror = (event) => {
//             super.error.call(this, event);
//         };
        
//         this.destination = Subscriber.create(
//             (message: string) => {
//                 this.ws.send(message);
//             },
//             (error) => {
//                 this.ws.close(1011);
//                 let error_event = new ErrorEvent();
//                 error_event.message = "Error in data stream.";
//                 error_event.error = error;
//                 super.error.call(this, error_event);
//             },
//             () => {
//                 this.ws.close(1011);
//                 let close_event = new CloseEvent();
//                 close_event.code = 1000;
//                 close_event.reason = "Connection closed by client.";
//                 close_event.wasClean = true;
//                 this.close_observer.next(close_event);
//             } 
//         );
//     }
    
//     next(value?: string) {
//         this.destination.next.call(this.destination, value);
//     };
    
//     error(err?) {
//         this.destination.error.call(this.destination, err);
//     }
    
//     complete() {
//         this.destination.complete.call(this.destination);
//     }
// }