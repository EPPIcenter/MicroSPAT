import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { LocusBinSet } from '../../models/bin-estimator/locus-bin-set';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class LocusBinSetService extends WebSocketBaseService<LocusBinSet> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('locus_bin_set', store);
  }

}
