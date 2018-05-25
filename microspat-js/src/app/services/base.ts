import { Observable, Subscription } from 'rxjs';
import { last, publish, debounceTime, buffer, refCount } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import * as io from 'socket.io-client';
import { BaseModel } from 'app/models/base';
import { GetReceivedAction, ListReceivedAction, GetEntityPayload, DeleteReceivedAction, UpdateReceivedAction } from 'app/actions/db';


export abstract class WebSocketBaseService<T> {
  private API_PATH = 'http://localhost:17328';
  protected socket;
  protected namespace: string;
  protected store: Store<any>;

  private _multicastUpdatedStream: Observable<any>;
  private _debounceUpdatedStream: Observable<any>;
  public updatedStream: Observable<any>;
  protected _updatedListener: Subscription;
  public bufferedUpdatedStream: Observable<any>;

  private _multicastCreatedStream: Observable<any>;
  private _debounceCreatedStream: Observable<any>;
  public createdStream: Observable<any>;
  protected _createdListener: Subscription;
  public bufferedCreatedStream: Observable<any>;

  private _multicastDeletedStream: Observable<any>;
  private _debounceDeletedStream: Observable<any>;
  public deletedStream: Observable<any>;
  protected _deletedListener: Subscription;
  public bufferedDeletedStream: Observable<any>;

  public getStream: Observable<GetEntityPayload>;
  protected _getListener: Subscription;
  public listStream: Observable<GetEntityPayload>;
  protected _listListener: Subscription;


  constructor(namespace: string, store: Store<any>) {
    this.store = store;
    this.setNameSpace(namespace);
    this.initSocket();
    this.initGet(store);
    this.initList(store);
    this.initCreated(store);
    this.initDeleted(store);
    this.initUpdated(store);
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
        console.log('Received List', this.namespace);
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

    this._multicastUpdatedStream = this.updatedStream.pipe(publish(), refCount());
    this._debounceUpdatedStream = this._multicastUpdatedStream.pipe(debounceTime(1000));
    this.bufferedUpdatedStream = this._multicastUpdatedStream.pipe(buffer(this._debounceUpdatedStream));

    this._multicastCreatedStream = this.createdStream.pipe(publish(), refCount());
    this._debounceCreatedStream = this._multicastCreatedStream.pipe(debounceTime(1000));
    this.bufferedCreatedStream = this._multicastCreatedStream.pipe(buffer(this._debounceCreatedStream));

    this._multicastDeletedStream = this.deletedStream.pipe(publish(), refCount());
    this._debounceDeletedStream = this._multicastDeletedStream.pipe(debounceTime(1000));
    this.bufferedDeletedStream = this._multicastDeletedStream.pipe(buffer(this._debounceDeletedStream));
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

  protected initCreated(store: Store<any>) {
    this._createdListener = this.bufferedCreatedStream.subscribe(data => {
      const ids = data.map(m => m.id);
      this.get(ids);
    });
  }

  protected initUpdated(store: Store<any>) {
    this._updatedListener = this.bufferedUpdatedStream.subscribe(data => {
      const details = data.map(m => {
        return {
          last_updated: new Date(m.last_updated),
          id: m.id
        };
      });
      store.dispatch(new UpdateReceivedAction({
        model: this.namespace,
        details: details
      }));
    });
  }

  protected initDeleted(store: Store<any>) {
    this._deletedListener = this.bufferedDeletedStream.subscribe(data => {
      const ids = data.map(m => m.id);
      store.dispatch(new DeleteReceivedAction({
        model: this.namespace,
        ids: ids
      }));
    });
  }

}

