import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { ArtifactEstimatorLocusParams } from '../../models/artifact-estimator/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class ArtifactEstimatorLocusParamsService extends WebSocketBaseService<ArtifactEstimatorLocusParams> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('artifact_estimator_locus_params', store, http);
  }

}
