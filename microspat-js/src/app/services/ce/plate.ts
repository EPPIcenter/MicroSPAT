import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';

import { WebSocketBaseService } from '../base';
import { Plate } from '../../models/ce/plate';
import * as fromRoot from 'app/reducers';
import { CreateReceivedAction } from 'app/actions/db';


@Injectable()
export class PlateService extends WebSocketBaseService<Plate> {
  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('plate', store);
  }

}
