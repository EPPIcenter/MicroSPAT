import { Injectable } from '@angular/core';

import { ArtifactEstimator } from '../../models/artifact-estimator/artifact-estimator';
import { WebSocketBaseService } from '../base';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ArtifactEstimatorService extends WebSocketBaseService<ArtifactEstimator> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('artifact_estimator', store);
  }

}
