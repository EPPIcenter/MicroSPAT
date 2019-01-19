import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';

import { Plate } from 'app/models/ce/plate';

import { WebSocketBaseService } from 'app/services/base';

import * as fromRoot from 'app/reducers';

@Injectable()
export class PlateService extends WebSocketBaseService<Plate> {
  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('plate', store, http, 500, 1500, 500);
    this.registerTask('recalculate_ladder', store);
    this.registerTask('upload_plate', store);
    this.registerTask('upload_plate_map', store);
    this.registerTask('delete', store);
  }

  public recalculateLadder(ladderID, plateID) {
    this.socket.emit('recalculate_ladder', {
      'ladder_id': ladderID,
      'plate_id': plateID
    });
  }

  public uploadPlate(plateFiles: FileList, ladderID: number) {
    this.uploadFiles('upload_plate', plateFiles, {ladder_id: ladderID}).subscribe()
  }

  public uploadPlateMap(plateMapFile: File, plateID: number, createNonExistentSamples) {
    this.uploadFile('upload_plate_map',
     plateMapFile, {
       plate_id: plateID,
       create_non_existent_samples: createNonExistentSamples
    }).subscribe()
  }

  public deletePlate(plateID: string | number) {
    this.socket.emit('delete', {
      'plate_id': plateID
    })
  }

}
