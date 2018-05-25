import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { Control } from '../../models/sample/control';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ControlService extends WebSocketBaseService<Control> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('control', store);
  }

}
