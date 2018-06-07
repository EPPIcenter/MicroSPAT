import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { ControlSampleAssociation } from '../../models/sample/control-sample-association';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class ControlSampleAssociationService extends WebSocketBaseService<ControlSampleAssociation> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('control_sample_association', store, http);
  }

}
