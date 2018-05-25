import { Injectable } from '@angular/core';

import { WebSocketBaseService } from '../base';
import { Well } from '../../models/ce/well';
import { Store } from '@ngrx/store';
import * as fromRoot from 'app/reducers';

@Injectable()
export class WellService extends WebSocketBaseService<Well> {

  constructor(
    protected store: Store<fromRoot.AppState>
  ) {
    super('well', store);
  }

  public recalculateLadder(wellId: number, ladderPeakIndices: number[]) {
    this.socket.emit('recalculate_ladder', {
      well_id: wellId,
      ladder_peak_indices: ladderPeakIndices
    });
  }

}
