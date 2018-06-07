import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { ArtifactEstimatorProject } from '../../models/artifact-estimator/project';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ArtifactEstimatorProjectService extends WebSocketBaseService<ArtifactEstimatorProject> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('artifact_estimator_project', store, http);
  }

}
