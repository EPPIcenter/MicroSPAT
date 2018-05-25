import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';

import * as fromRoot from 'app/reducers';
import { WebSocketBaseService } from './base';

@Injectable()
export class GlobalWebSocket extends WebSocketBaseService<any> {
  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('', store);
  }

}
