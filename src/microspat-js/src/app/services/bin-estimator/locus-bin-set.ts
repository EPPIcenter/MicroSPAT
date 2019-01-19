import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { LocusBinSet } from '../../models/bin-estimator/locus-bin-set';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class LocusBinSetService extends WebSocketBaseService<LocusBinSet> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('locus_bin_set', store, http);
  }

}
