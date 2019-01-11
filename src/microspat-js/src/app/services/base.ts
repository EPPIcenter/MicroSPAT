import { Observable, Subscription } from 'rxjs';
import { publish, debounceTime, buffer, refCount } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import * as io from 'socket.io-client';

import { BaseModel } from 'app/models/base';
import { GetReceivedAction, GetFailedAction, GetUpdatedReceivedAction, ListReceivedAction, GetEntityPayload, GetFailedPayload, DeleteReceivedAction, UpdateReceivedAction, GetRequestedAction } from 'app/actions/db';
import { Task, StartTask, SuccessfulTask, FailedTask, InProgressTask, START, SUCCESS, FAILURE, IN_PROGRESS } from 'app/models/task';
import { TaskStartedAction, TaskSuccessAction, TaskFailureAction, TaskProgressAction, RegisterTaskAction } from 'app/actions/tasks';
import { HttpClient } from '@angular/common/http';

export abstract class WebSocketBaseService<T> {
  private SOCKET_PATH = 'http://localhost:17328'
  protected API_PATH = `${this.SOCKET_PATH}/microspat_api`;
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
  public getFailedStream: Observable<any>;
  protected _getFailedListener: Subscription;
  public getUpdatedStream: Observable<GetEntityPayload>;
  protected _getUpdatedListener: Subscription;
  public listStream: Observable<GetEntityPayload>;
  protected _listListener: Subscription;


  constructor(
    namespace: string, store: Store<any>, protected http: HttpClient,
    debounceUpdateDelay = 500, debounceCreateDelay = 500, debounceDeleteDelay = 500) {
      this.store = store;
      this.setNameSpace(namespace);
      this.initSocket(debounceUpdateDelay, debounceCreateDelay, debounceDeleteDelay);
      this.initGet(store);
      this.initGetFailed(store);
      this.initGetUpdated(store);
      this.initList(store);
      this.initCreated(store);
      this.initDeleted(store);
      this.initUpdated(store);
  }

  protected initSocket(debounceUpdateDelay: number, debounceCreateDelay: number, debounceDeleteDelay: number): void {
    this.socket = io(this.getConnectionString(), {
      // upgrade: false,
      // transports: ['websocket'],
      timeout: 2e12
    });

    this.getStream = new Observable(observer => {
      this.socket.on('get', (data) => {
        data = this.parseWebSocketResponse(data);
        observer.next(data);
      });
    });

    this.getFailedStream = new Observable(observer => {
      this.socket.on('get_failed', (data) => {
        // data = this.parseWebSocketResponse(data);
        observer.next(data);
      })
    })

    this.getUpdatedStream = new Observable(observer => {
      this.socket.on('get_updated', (data) => {
        data = this.parseWebSocketResponse(data);
        observer.next(data);
      })
    })

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

    this._multicastUpdatedStream = this.updatedStream.pipe(publish(), refCount());
    this._debounceUpdatedStream = this._multicastUpdatedStream.pipe(debounceTime(debounceUpdateDelay));
    this.bufferedUpdatedStream = this._multicastUpdatedStream.pipe(buffer(this._debounceUpdatedStream));

    this._multicastCreatedStream = this.createdStream.pipe(publish(), refCount());
    this._debounceCreatedStream = this._multicastCreatedStream.pipe(debounceTime(debounceCreateDelay));
    this.bufferedCreatedStream = this._multicastCreatedStream.pipe(buffer(this._debounceCreatedStream));

    this._multicastDeletedStream = this.deletedStream.pipe(publish(), refCount());
    this._debounceDeletedStream = this._multicastDeletedStream.pipe(debounceTime(debounceDeleteDelay));
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
      // console.log('Task Received: ', task);
    });
  }

  public get(id: string | string[]): void {
    this.socket.emit('get', {
      id: id,
    });
  };

  public getUpdated(id: string | string[], detailed: boolean): void {
    this.socket.emit('get_updated', {
      id: id,
      detailed: detailed
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

  protected parseJSON(json: string, log: boolean = false): BaseModel[] {
    return JSON.parse(json, this.reviver);
  }

  protected initGet(store: Store<any>) {
    this._getListener = this.getStream.subscribe(data => {
      store.dispatch(new GetReceivedAction(data));
    });
  }

  protected initGetFailed(store: Store<any>) {
    this._getFailedListener = this.getFailedStream.subscribe(data => {
      this.store.dispatch(new GetFailedAction({
        model: this.namespace,
        entities: data[this.namespace]
      }));
    })
  }

  protected initGetUpdated(store: Store<any>) {
    this._getUpdatedListener = this.getUpdatedStream.subscribe(data => {
      store.dispatch(new GetUpdatedReceivedAction(data));
    })
  }

  protected initList(store: Store<any>) {
    this._listListener = this.listStream.subscribe(data => {
      store.dispatch(new ListReceivedAction(data));
    });
  }

  protected initCreated(store: Store<any>) {
    this._createdListener = this.bufferedCreatedStream.subscribe(data => {
      const ids = data.map(m => m.id);
      store.dispatch(new GetRequestedAction({model: this.namespace, ids: ids}));
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

