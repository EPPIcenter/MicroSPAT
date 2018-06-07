import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { QuantificationBiasEstimatorProject } from '../../models/quantification-bias-estimator/project';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class QuantificationBiasEstimatorProjectService extends WebSocketBaseService<QuantificationBiasEstimatorProject> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('quantification_bias_estimator_project', store, http);
  }

}
