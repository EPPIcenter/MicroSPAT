import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';

import { WebSocketBaseService } from 'app/services/base';
import { Genotype } from 'app/models/sample/genotype';
import * as fromRoot from 'app/reducers';

@Injectable()
export class GenotypeService extends WebSocketBaseService<Genotype> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('genotype', store, http, 10, 10, 10);
  }

}
