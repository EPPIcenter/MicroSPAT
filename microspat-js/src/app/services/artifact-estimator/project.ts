import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { ArtifactEstimatorProject } from '../../models/artifact-estimator/project';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ArtifactEstimatorProjectService extends WebSocketBaseService<ArtifactEstimatorProject> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('artifact_estimator_project', store);
  }

}
