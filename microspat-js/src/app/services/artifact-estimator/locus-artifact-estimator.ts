import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { LocusArtifactEstimator } from '../../models/artifact-estimator/locus-artifact-estimator';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class LocusArtifactEstimatorService extends WebSocketBaseService<LocusArtifactEstimator> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('locus_artifact_estimator', store);
  }
}
