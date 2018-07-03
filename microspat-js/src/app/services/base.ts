import { Observable, Subscription } from 'rxjs';
import { last, publish, debounceTime, buffer, refCount } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import * as io from 'socket.io-client';

import { BaseModel } from 'app/models/base';
import { GetReceivedAction, ListReceivedAction, GetEntityPayload, DeleteReceivedAction, UpdateReceivedAction, GetRequestedAction } from 'app/actions/db';
import { Task, StartTask, SuccessfulTask, FailedTask, InProgressTask, START, SUCCESS, FAILURE, IN_PROGRESS } from 'app/models/task';
import { TaskStartedAction, TaskSuccessAction, TaskFailureAction, TaskProgressAction, RegisterTaskAction } from '../actions/tasks';
import { HttpClient } from '@angular/common/http';
import { HttpRequest } from 'selenium-webdriver/http';
import { isArray } from 'util';

export abstract class WebSocketBaseService<T> {
  private SOCKET_PATH = 'http://localhost:17328'
  private API_PATH = `${this.SOCKET_PATH}/microspat_v2`;
  protected socket;
  protected namespace: string;
  protected store: Store<any>;
  protected activeTasks: {
    [taskNamespace: string]: {
      [taskID: string]: Observable<any>
    }
  } = {};

  protected taskStream: {[task: string]: Observable<Task>} = {};

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


  constructor(namespace: string, store: Store<any>, protected http: HttpClient) {
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
      transports: ['websocket'],
      timeout: 2e12
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
    this._debounceUpdatedStream = this._multicastUpdatedStream.pipe(debounceTime(500));
    this.bufferedUpdatedStream = this._multicastUpdatedStream.pipe(buffer(this._debounceUpdatedStream));

    this._multicastCreatedStream = this.createdStream.pipe(publish(), refCount());
    this._debounceCreatedStream = this._multicastCreatedStream.pipe(debounceTime(500));
    this.bufferedCreatedStream = this._multicastCreatedStream.pipe(buffer(this._debounceCreatedStream));

    this._multicastDeletedStream = this.deletedStream.pipe(publish(), refCount());
    this._debounceDeletedStream = this._multicastDeletedStream.pipe(debounceTime(500));
    this.bufferedDeletedStream = this._multicastDeletedStream.pipe(buffer(this._debounceDeletedStream));
  }

  protected setNameSpace(namespace: string) {
    this.namespace = namespace;
  }

  protected getConnectionString() {
    return `${this.SOCKET_PATH}/${this.namespace}`;
  }

  protected registerTask(taskNamespace: string, store: Store<any>) {
    store.dispatch(new RegisterTaskAction({namespace: this.namespace, task: taskNamespace}));
    this.taskStream[taskNamespace] = new Observable(observer => {
      this.socket.on(taskNamespace, (data) => {
        const task = Object.assign(data, {
          namespace: this.namespace,
          task: taskNamespace
        })
        observer.next(task);
      });
    });


    this.taskStream[taskNamespace].subscribe(task => {
      switch (task.status) {
        case START:
          store.dispatch(new TaskStartedAction(<StartTask>task));
          break;
        case SUCCESS:
          store.dispatch(new TaskSuccessAction(<SuccessfulTask>task));
          break;
        case FAILURE:
          store.dispatch(new TaskFailureAction(<FailedTask>task));
          break;
        case IN_PROGRESS:
          store.dispatch(new TaskProgressAction(<InProgressTask>task));
          break;
        default:
          console.error('Failed to process task', task);
      }
      console.log('Task Received: ', task);
    });
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
      store.dispatch(new GetRequestedAction({
        model: this.namespace,
        ids: ids
      }));
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

  protected uploadFiles(destination: string, files: FileList, args: {[key: string]: any}) {
    const formData = new FormData();
    console.log(files);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      formData.append('files', file, file['name']);
    }

    Object.keys(args).forEach(k => {
      formData.append(k, args[k])
    });

    return this.http.post(`${this.API_PATH}/${this.namespace}/${destination}/`, formData)
  }

  protected uploadFile(destination: string, file: File, args: {[key: string]: any} = {}) {
    const formData = new FormData();
    formData.append('files', file, file['name']);
    Object.keys(args).forEach(k => {
      formData.append(k, args[k])
    });

    return this.http.post(`${this.API_PATH}/${this.namespace}/${destination}/`, formData)
  }

}

