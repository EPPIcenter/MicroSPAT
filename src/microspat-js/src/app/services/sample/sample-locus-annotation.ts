import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { SampleLocusAnnotation } from '../../models/sample/sample-locus-annotation';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class SampleLocusAnnotationService extends WebSocketBaseService<SampleLocusAnnotation> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('sample_locus_annotation', store, http);
  }

}
