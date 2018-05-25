import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { ProjectChannelAnnotations } from '../../models/project/channel-annotations';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ProjectChannelAnnotationsService extends WebSocketBaseService<ProjectChannelAnnotations> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('project_channel_annotations', store);
  }

}
