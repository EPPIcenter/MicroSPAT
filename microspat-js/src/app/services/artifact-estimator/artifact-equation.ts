import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { HttpClient } from '@angular/common/http';

import * as fromRoot from 'app/reducers';
import { WebSocketBaseService } from '../base';
import { ArtifactEquation } from '../../models/artifact-estimator/artifact-equation';

@Injectable()
export class ArtifactEquationService extends WebSocketBaseService<ArtifactEquation> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('artifact_equation', store, http);
  }
}
