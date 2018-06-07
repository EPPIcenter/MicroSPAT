import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { GenotypingLocusParams } from '../../models/genotyping/locus-params';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class GenotypingLocusParamsService extends WebSocketBaseService<GenotypingLocusParams> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('genotyping_locus_params', store, http);
  }

}
