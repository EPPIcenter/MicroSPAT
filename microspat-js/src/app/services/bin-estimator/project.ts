import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { BinEstimatorProject } from '../../models/bin-estimator/project';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class BinEstimatorProjectService extends WebSocketBaseService<BinEstimatorProject> {

  constructor(
    protected store: Store<fromRoot.AppState>, http: HttpClient
  ) {
    super('bin_estimator_project', store, http);
  }

}
