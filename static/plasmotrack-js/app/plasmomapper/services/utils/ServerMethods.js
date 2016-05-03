System.register(['angular2/core', 'angular2/http', 'rxjs/Observable', '../../api'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    var __metadata = (this && this.__metadata) || function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };
    var core_1, http_1, Observable_1, api_1;
    var CommonServerMethods;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (http_1_1) {
                http_1 = http_1_1;
            },
            function (Observable_1_1) {
                Observable_1 = Observable_1_1;
            },
            function (api_1_1) {
                api_1 = api_1_1;
            }],
        execute: function() {
            CommonServerMethods = (function () {
                function CommonServerMethods(http) {
                    this.http = http;
                    this.socket = io(api_1.SERVER_BASE);
                    this.socket.on('connect', function (event) {
                        console.log(event);
                        console.log("Socket Connected");
                    });
                    this.socket.on('test', function (event) {
                        console.log(event);
                        console.log("Test Event Fired");
                    });
                    this.socket.on('server_test', function (event) {
                        console.log(event);
                        console.log("Server Test Event Received");
                    });
                }
                CommonServerMethods.prototype.getList = function (type, url) {
                    // console.log("Getting List");
                    // this.socket.emit('client_test');
                    return this.http.get(url)
                        .map(function (res_array) { return res_array.json().data; })
                        .map(function (res_array) { return res_array.map(function (res) {
                        var t = new type();
                        t.fillFromJSON(res);
                        return t;
                    }); })
                        .catch(this.handleError);
                };
                ;
                CommonServerMethods.prototype.getDetails = function (id, type, url, cache) {
                    if (cache != null && cache.has(id)) {
                        var item = [cache.get(id)];
                        return Observable_1.Observable.from(item, function (i) { return i; });
                    }
                    else {
                        return this.http.get(url + id)
                            .map(function (res) { return res.json().data; })
                            .map(function (res) {
                            var t = new type();
                            t.fillFromJSON(res);
                            return t;
                        })
                            .do(function (data) { return cache.set(id, data); })
                            .catch(this.handleError);
                    }
                };
                CommonServerMethods.prototype.getUrl = function (url) {
                    return this.http.get(url)
                        .map(function (res) { return res.json().data; })
                        .catch(this.handleError);
                };
                CommonServerMethods.prototype.updateItem = function (item, type, url, cache) {
                    var headers = new http_1.Headers();
                    headers.append('Content-Type', 'application/json');
                    return this.http.put(url + item.id + '/', JSON.stringify(item), { headers: headers })
                        .map(function (res) { return res.json().data; })
                        .map(function (res) {
                        var t = new type();
                        t.fillFromJSON(res);
                        return t;
                    })
                        .do(function (data) {
                        if (data.id != null && cache != null) {
                            cache.set(data.id, data);
                        }
                    })
                        .catch(this.handleError);
                };
                CommonServerMethods.prototype.createItem = function (item, type, url, cache) {
                    // console.log("Creating Item on Server");
                    var headers = new http_1.Headers();
                    headers.append('Content-Type', 'application/json');
                    return this.http.post(url, JSON.stringify(item), { headers: headers })
                        .map(function (res) { return res.json().data; })
                        .map(function (res) {
                        var t = new type();
                        t.fillFromJSON(res);
                        return t;
                    })
                        .do(function (data) { return cache.set(data.id, data); })
                        .catch(this.handleError);
                };
                CommonServerMethods.prototype.deleteItem = function (id, url, cache) {
                    console.log("Deleting item on server");
                    return this.http.delete(url + id + '/')
                        .map(function (res) { return res.json().data; })
                        .do(function (data) {
                        if (cache) {
                            cache.remove(id);
                        }
                    })
                        .catch(this.handleError);
                };
                CommonServerMethods.prototype.postFiles = function (files, url, params) {
                    var promise = new Promise(function (resolve, reject) {
                        var formData = new FormData();
                        var xhr = new XMLHttpRequest();
                        for (var i = 0; i < files.length; i++) {
                            formData.append("files", files[i], files[i].name);
                        }
                        for (var p in params) {
                            formData.append(p, params[p]);
                        }
                        xhr.onreadystatechange = function () {
                            if (xhr.readyState == 4) {
                                if (xhr.status == 200) {
                                    resolve(JSON.parse(xhr.response).data);
                                }
                                else {
                                    reject(JSON.parse(xhr.response).error);
                                }
                            }
                        };
                        xhr.open("POST", url, true);
                        xhr.send(formData);
                    });
                    return Observable_1.Observable.fromPromise(promise).map(function (res) { return res; });
                };
                CommonServerMethods.prototype.postJSON = function (obj, url) {
                    var headers = new http_1.Headers();
                    headers.append('Content-Type', 'application/json');
                    return this.http.post(url, JSON.stringify(obj), { headers: headers })
                        .catch(this.handleError);
                };
                CommonServerMethods.prototype.handleError = function (error) {
                    console.log(error);
                    return Observable_1.Observable.throw(error.json().error || 'Server error');
                };
                ;
                CommonServerMethods = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [http_1.Http])
                ], CommonServerMethods);
                return CommonServerMethods;
            }());
            exports_1("CommonServerMethods", CommonServerMethods);
        }
    }
});
//# sourceMappingURL=ServerMethods.js.map