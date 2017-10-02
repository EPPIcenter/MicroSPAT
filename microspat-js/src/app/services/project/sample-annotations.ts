import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { ProjectSampleAnnotations } from '../../models/project/sample-annotations';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ProjectSampleAnnotationsService extends WebSocketBaseService<ProjectSampleAnnotations> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('project_sample_annotations', store);
  }

}
