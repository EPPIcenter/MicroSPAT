import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import 'rxjs/add/operator/last';
import 'rxjs/add/operator/publish';
import 'rxjs/add/operator/debouncetime';
import 'rxjs/add/operator/buffer';
import { Store } from '@ngrx/store';
import * as io from 'socket.io-client';
import { BaseModel } from 'app/models/base';
import { GetReceivedAction, ListReceivedAction, GetEntityPayload } from 'app/actions/db';



export abstract class WebSocketBaseService<T> {
  private API_PATH = 'http://localhost:17328';
  protected socket;
  protected namespace: string;

  private _multicastUpdatedStream: Observable<any>;
  private _debounceUpdatedStream: Observable<any>;
  public updatedStream: Observable<any>;
  public bufferedUpdatedStream: Observable<any>;

  private _multicastCreatedStream: Observable<any>;
  private _debounceCreatedStream: Observable<any>;
  public createdStream: Observable<any>;
  public bufferedCreatedStream: Observable<any>;

  private _multicastDeletedStream: Observable<any>;
  private _debounceDeletedStream: Observable<any>;
  public deletedStream: Observable<any>;
  public bufferedDeletedStream: Observable<any>;

  public getStream: Observable<GetEntityPayload>;
  protected _getListener: Subscription;
  public listStream: Observable<GetEntityPayload>;
  protected _listListener: Subscription;


  constructor(namespace: string, store: Store<any>) {
    this.setNameSpace(namespace);
    this.initSocket();
    this.initGet(store);
    this.initList(store);
  }

  protected initSocket(): void {
    this.socket = io(this.getConnectionString(), {
      upgrade: false,
      transports: ['websocket']
    });

    this.getStream = new Observable(observer => {
      this.socket.on('get', (data) => {
        data = this.parseWebSocketResponse(data);
        observer.next(data);
      });
    });

    this.listStream = new Observable(observer => {
      this.socket.on('list', (data) => {
        data = this.parseWebSocketResponse(data);
        observer.next(data);
      });
    });

    this.updatedStream = new Observable(observer => {
      this.socket.on('updated', (data) => {
        observer.next(data);
      });
    });

    this.createdStream = new Observable(observer => {
      this.socket.on('created', (data) => {
        observer.next(data);
      });
    });

    this.deletedStream = new Observable(observer => {
      this.socket.on('deleted', (data) => {
        observer.next(data);
      });
    });

    this._multicastUpdatedStream = this.updatedStream.publish().refCount();
    this._debounceUpdatedStream = this._multicastUpdatedStream.debounceTime(1000);
    this.bufferedUpdatedStream = this._multicastUpdatedStream.buffer(this._debounceUpdatedStream);

    this._multicastCreatedStream = this.createdStream.publish().refCount();
    this._debounceCreatedStream = this._multicastCreatedStream.debounceTime(1000);
    this.bufferedCreatedStream = this._multicastCreatedStream.buffer(this._debounceCreatedStream);

    this._multicastDeletedStream = this.deletedStream.publish().refCount();
    this._debounceDeletedStream = this._multicastDeletedStream.debounceTime(1000);
    this.bufferedDeletedStream = this._multicastDeletedStream.buffer(this._debounceUpdatedStream);
  }

  protected setNameSpace(namespace: string) {
    this.namespace = namespace;
  }

  protected getConnectionString() {
    return `${this.API_PATH}/${this.namespace}`;
  }

  public get(id: string | string[]): void {
    this.socket.emit('get', {
      id: id
    });
  };

  public list(): void {
    this.socket.emit('list');
  };

  protected parseWebSocketResponse(data: any): BaseModel {
    return Object.keys(data).reduce((parsedData: any, key: string) => {
      const parsedField = this.parseJSON(data[key]);
      return Object.assign(parsedData, {
        model: key,
        entities: parsedField
      });
    }, {});
  }

  protected reviver(key, value) {
    if (key === 'last_updated' || key === 'date' || key === 'date_processed' || key === 'date_run') {
      return new Date(value);
    } else {
      return value;
    }
  }

  protected parseJSON(json: string): BaseModel[] {
    return JSON.parse(json, this.reviver);
  }

  protected initGet(store: Store<any>) {
    this._getListener = this.getStream.subscribe(data => {
      store.dispatch(new GetReceivedAction(data));
    });
  }

  protected initList(store: Store<any>) {
    this._listListener = this.listStream.subscribe(data => {
      store.dispatch(new ListReceivedAction(data));
    });
  }

}

