import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { BinEstimatorLocusParams } from '../../models/bin-estimator/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';


@Injectable()
export class BinEstimatorLocusParamsService extends WebSocketBaseService<BinEstimatorLocusParams> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('bin_estimator_locus_params', store, http);
  }

}
