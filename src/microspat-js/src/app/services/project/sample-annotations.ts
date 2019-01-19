import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { ProjectSampleAnnotations } from '../../models/project/sample-annotations';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class ProjectSampleAnnotationsService extends WebSocketBaseService<ProjectSampleAnnotations> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('project_sample_annotations', store, http, 1500, 1500, 1500);
  }

}
