import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { Ladder } from '../../models/ce/ladder';
import * as fromRoot from 'app/reducers';


@Injectable()
export class LadderService extends WebSocketBaseService<Ladder> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('ladder', store, http);
  }

}
