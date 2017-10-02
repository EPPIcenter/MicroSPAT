import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { QuantificationBiasEstimatorProject } from '../../models/quantification-bias-estimator/project';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class QuantificationBiasEstimatorProjectService extends WebSocketBaseService<QuantificationBiasEstimatorProject> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('quantification_bias_estimator_project', store);
  }

}
