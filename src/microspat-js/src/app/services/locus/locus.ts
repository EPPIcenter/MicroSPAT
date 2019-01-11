import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { Locus } from '../../models/locus/locus';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class LocusService extends WebSocketBaseService<Locus> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('locus', store, http);
    this.registerTask('save', store);
    this.registerTask('delete', store);
  }

  public saveLocus(locus: Locus) {
    this.socket.emit('save', locus);
  }

  public deleteLocus(locusID: number) {
    this.socket.emit('delete', {
      id: locusID
    })
  }
}
