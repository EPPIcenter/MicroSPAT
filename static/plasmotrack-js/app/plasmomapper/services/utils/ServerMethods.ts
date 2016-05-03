import { Injectable }       from 'angular2/core';
import { Http, Response, Headers }   from 'angular2/http';

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
       this.socket.on('connect', (event) =>{
           console.log(event);
           console.log("Socket Connected");
       });
       
       this.socket.on('test', (event) => {
           console.log(event);
           console.log("Test Event Fired");
       })
       
       this.socket.on('server_test', (event) => {
           console.log(event);
           console.log("Server Test Event Received");
       })
       
    }
    
    
    
    public getList<T extends DatabaseItem> (type: { new(): T ;} , url: string) : Observable<T[]> {
        // console.log("Getting List");
        // this.socket.emit('client_test');
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
        if(cache != null && cache.has(id)) {
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
                        .do(data => cache.set(id, data))
                        .catch(this.handleError);
        }
    }
    
    public getUrl(url) : Observable<any> {
        return this.http.get(url)
                    .map(res => <Object> res.json().data)
                    .catch(this.handleError);
    }
    
    public updateItem<T extends DatabaseItem>(item: T, type: { new(): T ;}, url: string, cache?: LRUCache<T>) : Observable<T> {
        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        return this.http.put(url + item.id + '/', JSON.stringify(item), {headers: headers})
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
        // console.log("Creating Item on Server");
        
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
        console.log("Deleting item on server");
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
        return this.http.post(url, JSON.stringify(obj), {headers: headers})
                    .catch(this.handleError);
    }
    
    protected handleError(error: Response) {
        console.log(error);
        return Observable.throw(error.json().error || 'Server error');
    };
}