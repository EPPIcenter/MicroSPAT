import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { LocusSet } from '../../models/locus/locus-set';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class LocusSetService extends WebSocketBaseService<LocusSet> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('locus_set', store);
  }

}
