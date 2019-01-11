import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { Control } from '../../models/sample/control';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class ControlService extends WebSocketBaseService<Control> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('control', store, http);
    this.registerTask('create', store);
    this.registerTask('delete', store);
  }

  createControl(ctrl: Control) {
    this.socket.emit('create', ctrl);
  }

  deleteControl(id: number) {
    this.socket.emit('delete', {id});
  }

}
