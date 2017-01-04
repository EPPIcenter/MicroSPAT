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

import { Injectable }       from '@angular/core';
import { Http, Response, Headers }   from '@angular/http';

import { Observable }       from 'rxjs/Observable';

import { LRUCache }         from './LRUCache';
import { DatabaseItem } from '../DatabaseItem';

import { SERVER_BASE } from '../../api';
import { SocketSubject } from './SocketSubject';
import * as SocketIOClient from 'socket.io-client';

@Injectable()
export class CommonServerMethods {
    
    public socket: SocketIOClient.Socket;
    
    constructor(protected http: Http) {
       this.socket = io(SERVER_BASE) 
    }
    
    
    
    public getList<T extends DatabaseItem> (type: { new(): T ;} , url: string) : Observable<T[]> {
        return this.http.get(url)
                        .map(res_array => <Object[]> res_array.json().data)
                        .map(res_array => res_array.map((res) =>{                            
                            let t = new type();
                            t.fillFromJSON(res);
                            return t
                        }))
                        .catch(this.handleError);
    };
    
    public getDetails<T extends DatabaseItem>(id: number, type: { new(): T ;}, url: string, cache?: LRUCache<T>) : Observable<T> {
        if(cache != null && cache.find(id)) {
            let item = [cache.get(id)];
            return Observable.from(item, i => <T> i);             
        } else {
            return this.http.get(url + id)
                        .map(res => <Object> res.json().data)
                        .map((res) => {
                            let t = new type();
                            t.fillFromJSON(res);
                            return t;
                        })
                        .do(data => {
                            if(cache != null){
                                cache.set(id, data)
                            }
                        })
                        .catch(this.handleError);
        }
    }

    public getUrl(url) : Observable<any> {
        return this.http.get(url)
                    .map(res => {
                        return <Object> res.json().data
                    })
                    .catch(this.handleError);
    }

    public getFile(url) : Observable<any> {
        return Observable.from(url).map(() => {
            window.location = url;
        })
        .catch(this.handleError);
    }
    
    public updateItem<T extends DatabaseItem>(item: T, type: { new(): T ;}, url: string, cache?: LRUCache<T>) : Observable<T> {
        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        return this.http.put(url + item.id + '/', JSON.stringify(item, (k, v) => {
            if(k.startsWith('_')) {
                return undefined;
            } else {
                return v;
            }
        }), {headers: headers})
            .map(res => <Object> res.json().data)
            .map((res) => {
                            let t = new type();
                            t.fillFromJSON(res);
                            return t;
                        })
            .do(data => {
                if(data.id != null && cache != null) {
                    cache.set(data.id, data)    
                }
            })  
            .catch(this.handleError);
    }
    
    public createItem<T extends DatabaseItem>(item: any, type: { new(): T ;}, url: string, cache?: LRUCache<T>): Observable<T> {
        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        
        return this.http.post(url, JSON.stringify(item), {headers: headers})
                .map(res => <Object> res.json().data)
                .map((res) => {
                            let t = new type();
                            t.fillFromJSON(res);
                            return t;
                        })
                .do(data => cache.set(data.id, data))
                .catch(this.handleError);
        
    }
    
    public deleteItem<T extends DatabaseItem>(id: number, url: string, cache?: LRUCache<T>): Observable<T> {
        return this.http.delete(url + id + '/')
                    .map(res => <Object> res.json().data)
                    .do(data => {
                        if(cache) {
                            cache.remove(id)
                        }
                    })
                    .catch(this.handleError);
    }
    
    public postFiles(files: File[], url: string, params: Object){
        let promise = new Promise<Object[]>((resolve, reject) => {
            let formData = new FormData();
            let xhr = new XMLHttpRequest();
            for(let i = 0; i < files.length; i ++) {
                formData.append("files", files[i], files[i].name);
            }
            for(let p in params) {
                formData.append(p, params[p]);
            }
            xhr.onreadystatechange = () => {
                if(xhr.readyState == 4) {
                    if(xhr.status == 200) {
                        resolve(JSON.parse(xhr.response).data);    
                    } else {
                        reject(JSON.parse(xhr.response).error);
                    }
                }
            }
            xhr.open("POST", url, true);
            xhr.send(formData);
        });
        
        return Observable.fromPromise(promise).map(res => res);
    }
    
    public postJSON(obj: Object, url: string) {
        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        let stringified = JSON.stringify(obj, (k, v) => {
            if(k.startsWith('_')) {
                return undefined;
            } else {
                return v;
            }
        })
        
        return this.http.post(url, stringified, {headers: headers})
                    .catch(this.handleError);
    }
    
    protected handleError(error: Response) {
        return Observable.throw(error.json || 'Server error');
    };
}