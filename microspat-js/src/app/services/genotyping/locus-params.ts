import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { GenotypingLocusParams } from '../../models/genotyping/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class GenotypingLocusParamsService extends WebSocketBaseService<GenotypingLocusParams> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('genotyping_locus_params', store);
  }

}
