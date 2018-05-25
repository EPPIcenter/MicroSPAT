import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { BinEstimatorLocusParams } from '../../models/bin-estimator/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';


@Injectable()
export class BinEstimatorLocusParamsService extends WebSocketBaseService<BinEstimatorLocusParams> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('bin_estimator_locus_params', store);
  }

}
