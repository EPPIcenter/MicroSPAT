import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { LocusArtifactEstimator } from '../../models/artifact-estimator/locus-artifact-estimator';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class LocusArtifactEstimatorService extends WebSocketBaseService<LocusArtifactEstimator> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('locus_artifact_estimator', store, http);
  }
}
