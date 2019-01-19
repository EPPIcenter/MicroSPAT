import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { ProjectChannelAnnotations } from '../../models/project/channel-annotations';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class ProjectChannelAnnotationsService extends WebSocketBaseService<ProjectChannelAnnotations> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('project_channel_annotations', store, http, 1500, 1500, 1500);
  }

}
