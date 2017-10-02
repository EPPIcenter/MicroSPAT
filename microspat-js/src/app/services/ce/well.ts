import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { Well } from '../../models/ce/well';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class WellService extends WebSocketBaseService<Well> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('well', store);
  }

}
