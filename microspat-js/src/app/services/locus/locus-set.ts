import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { LocusSet } from '../../models/locus/locus-set';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class LocusSetService extends WebSocketBaseService<LocusSet> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('locus_set', store, http);
    this.registerTask('save', store);
    this.registerTask('delete', store)
  }

  public saveLocusSet(ls: {label: string; loci: number[]}) {
    this.socket.emit('save', ls);
  }

  public deleteLocusSet(id: number) {
    this.socket.emit('delete', {
      id: id
    });
  }

}
