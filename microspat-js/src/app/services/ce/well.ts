import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { Well } from '../../models/ce/well';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class WellService extends WebSocketBaseService<Well> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('well', store, http);
    this.registerTask('recalculate_ladder', store);
  }

  public recalculateLadder(wellID: number, ladderPeakIndices: number[]) {
    this.socket.emit('recalculate_ladder', {
      'well_id': wellID,
      'ladder_peak_indices': ladderPeakIndices
    });
  }

}
