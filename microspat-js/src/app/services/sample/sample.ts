import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { Sample } from '../../models/sample/sample';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class SampleService extends WebSocketBaseService<Sample> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('sample', store);
  }

}
