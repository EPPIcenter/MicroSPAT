import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { SampleLocusAnnotation } from '../../models/sample/sample-locus-annotation';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class SampleLocusAnnotationService extends WebSocketBaseService<SampleLocusAnnotation> {

  constructor(
    private store: Store<fromRoot.State>

  ) {
    super('sample_locus_annotation', store);
  }

}
