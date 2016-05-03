System.register(['rxjs/Subscriber', 'rxjs/Subject'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var Subscriber_1, Subject_1;
    var SocketSubject;
    return {
        setters:[
            function (Subscriber_1_1) {
                Subscriber_1 = Subscriber_1_1;
            },
            function (Subject_1_1) {
                Subject_1 = Subject_1_1;
            }],
        execute: function() {
            SocketSubject = (function (_super) {
                __extends(SocketSubject, _super);
                function SocketSubject(url, open_observer, close_observer) {
                    var _this = this;
                    _super.call(this);
                    this.url = url;
                    this.open_observer = open_observer;
                    this.close_observer = close_observer;
                    this.socket = io(url);
                    this.socket.on('connect', function (event) { return _this.open_observer.next(event); });
                    this.socket.on('disconnect', function (event) { return _this.close_observer.next(event); });
                    this.destination = Subscriber_1.Subscriber.create(function (message) {
                        _this.socket.send(message);
                    }, function (error) {
                        _this.socket.close();
                        var errorEvent = new ErrorEvent();
                        errorEvent.message = "Error in data stream.";
                        errorEvent.error = error;
                        _super.prototype.error.call(_this, errorEvent);
                    }, function () {
                        _this.socket.close();
                        var closeEvent = new CloseEvent();
                        closeEvent.code = 1000;
                        closeEvent.reason = "Connection closed by client.";
                        closeEvent.wasClean = true;
                        _this.close_observer.next(closeEvent);
                    });
                }
                SocketSubject.prototype.next = function (value) {
                    this.destination.next.call(this.destination, value);
                };
                ;
                SocketSubject.prototype.error = function (err) {
                    this.destination.error.call(this.destination, err);
                };
                SocketSubject.prototype.complete = function () {
                    this.destination.complete.call(this.destination);
                };
                return SocketSubject;
            }(Subject_1.Subject));
            exports_1("SocketSubject", SocketSubject);
        }
    }
});
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
//# sourceMappingURL=SocketSubject.js.map