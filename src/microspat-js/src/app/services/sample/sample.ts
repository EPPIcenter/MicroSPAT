import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';

import { WebSocketBaseService } from '../base';
import { Sample } from 'app/models/sample/sample';
import * as fromRoot from 'app/reducers';

@Injectable()
export class SampleService extends WebSocketBaseService<Sample> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('sample', store, http);
    this.registerTask('upload_samples', store);
  }

  uploadSamples(f: File) {
    this.uploadFile('upload_samples', f).subscribe(res => {
    })
  }

}
