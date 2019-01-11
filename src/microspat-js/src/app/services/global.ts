import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { HttpClient } from '@angular/common/http';

import * as fromRoot from '../reducers';
import { WebSocketBaseService } from './base';

@Injectable()
export class GlobalWebSocket extends WebSocketBaseService<any> {
  constructor(
    protected store: Store<fromRoot.AppState>, http: HttpClient
  ) {
    super('', store, http);
  }

}
