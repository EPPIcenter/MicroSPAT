import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { Bin } from '../../models/bin-estimator/bin';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

export interface BinSettings {
  id: number,
  label: string,
  base_size: number,
  bin_buffer: number
}

@Injectable()
export class BinService extends WebSocketBaseService<Bin> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('bin', store, http);
    this.registerTask('save_bin', store);
    this.registerTask('add_bin', store);
    this.registerTask('delete_bin', store);
  }

  public saveBin(binSettings: BinSettings) {
    this.socket.emit('save_bin', binSettings);
  }

  public addBin(e: {base_size: number, locus_bin_set_id: number}) {
    this.socket.emit('add_bin', e);
  }

  public deleteBin(binID: number) {
    this.socket.emit('delete_bin', {
      id: binID
    })
  }


}
