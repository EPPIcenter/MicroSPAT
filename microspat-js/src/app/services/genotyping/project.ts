import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { GenotypingProject } from '../../models/genotyping/project';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class GenotypingProjectService extends WebSocketBaseService<GenotypingProject> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('genotyping_project', store);
  }

}
