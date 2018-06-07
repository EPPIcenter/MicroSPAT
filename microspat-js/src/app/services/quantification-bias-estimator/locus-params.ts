import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { QuantificationBiasEstimatorLocusParams } from '../../models/quantification-bias-estimator/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class QuantificationBiasEstimatorLocusParamsService extends WebSocketBaseService<QuantificationBiasEstimatorLocusParams> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('quantification_bias_estimator_locus_params', store, http);
  }

}
