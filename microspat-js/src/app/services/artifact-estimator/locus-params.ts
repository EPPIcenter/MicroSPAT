import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { ArtifactEstimatorLocusParams } from '../../models/artifact-estimator/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ArtifactEstimatorLocusParamsService extends WebSocketBaseService<ArtifactEstimatorLocusParams> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('artifact_estimator_locus_params', store);
  }

}
