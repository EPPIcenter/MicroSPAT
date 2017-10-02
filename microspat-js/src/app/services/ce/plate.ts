import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';

import { WebSocketBaseService } from '../base';
import { Plate } from '../../models/ce/plate';
import * as fromRoot from 'app/reducers';


@Injectable()
export class PlateService extends WebSocketBaseService<Plate> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('plate', store);
  }

}
