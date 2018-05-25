import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { Locus } from '../../models/locus/locus';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class LocusService extends WebSocketBaseService<Locus> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('locus', store);
  }

}
