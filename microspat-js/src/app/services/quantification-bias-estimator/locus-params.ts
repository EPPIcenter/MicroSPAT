import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { QuantificationBiasEstimatorLocusParams } from '../../models/quantification-bias-estimator/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class QuantificationBiasEstimatorLocusParamsService extends WebSocketBaseService<QuantificationBiasEstimatorLocusParams> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('quantification_bias_estimator_locus_params', store);
  }

}
