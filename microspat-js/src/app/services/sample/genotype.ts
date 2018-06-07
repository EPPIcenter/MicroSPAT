import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';


import { WebSocketBaseService } from '../base';
import { Genotype } from '../../models/sample/genotype';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class GenotypeService extends WebSocketBaseService<Genotype> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('genotype', store, http);
  }

}
