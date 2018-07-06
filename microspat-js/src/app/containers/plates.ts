import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { tap, take, map, switchMap, mergeMap, filter } from 'rxjs/operators';

import { PlateService } from 'app/services/ce/plate';

import * as fromRoot from 'app/reducers';
import * as fromPlates from 'app/reducers/plates/plates';
import * as fromDB from 'app/reducers/db';
import * as fromKeyboard from 'app/reducers/keyboard';
import * as fromTasks from 'app/reducers/tasks';

import * as plates from 'app/actions/plates';

import { Plate } from 'app/models/ce/plate';
import { Well } from 'app/models/ce/well';
import { Ladder } from 'app/models/ce/ladder';
import { Square } from 'app/models/square';
import { Trace, Legend } from 'app/containers/components/plots/canvas';
import { Locus } from 'app/models/locus/locus';
import { Task } from 'app/models/task';
import { MatCheckboxChange, MatSelectChange } from '@angular/material';

export interface UploadPlateAction {
  plates: FileList;
  ladder: string | number;
}

export interface UploadPlateMapAction {
  plateMap: File,
  plateID: number | string,
  createNonExistentSamples: boolean
}

@Component({
  selector: 'mspat-plates',
  template: `
  <div class="container-fluid">
    <div class="row">
      <div class="col-sm-5">
        <div class="row">
          <div class="col-sm-12">
            <mspat-plate-uploader
            [ladders]="ladders$ | async"
            [activeUploadPlatesTasks]="activeUploadPlatesTasks$ | async"
            [failedUploadPlatesTasks]="failedUploadPlatesTasks$ | async"
            [activeTasks]="activeTasks$ | async"
            (uploadPlate)="uploadPlate($event)"
            ></mspat-plate-uploader>
          </div>
        </div>
        <div class="row">
          <div class="col-sm-12">
            <mspat-plates-list
            [plates]="plates$ | async"
            [newPlatesLoading]="newPlatesLoading$ | async"
            [selectedPlate]="selectedPlate$ | async"
            (selectPlate)="selectPlate($event)">
            </mspat-plates-list>
          </div>
        </div>
      </div>
      <div class="col-sm-7">
        <mspat-plate-details
          [plate]="selectedPlate$ | async"
          [plateLoading]="plateLoading$ | async"
          [ladderRenderable]="ladderRenderable$ | async"
          [channelRenderable]="channelRenderable$ | async"
          [wellLoading]="wellLoading$ | async"
          [activeWell]="activeWell$ | async"
          [ladderData]="ladderData$ | async"
          [baseSizes]="baseSizes$ | async"
          [peakIndices]="peakIndices$ | async"
          [activeChannelTraces]="activeChannelTraces$ | async"
          [activeChannelsRange]="activeChannelsRange$ | async"
          [activePlateDiagnosticTraces]="activePlateDiagnosticTraces$ | async"
          [activePlateDiagnosticRange]="activePlateDiagnosticRange$ | async"
          [activePlateDiagnosticDomain]="activePlateDiagnosticDomain$ | async"
          [activePlateDiagnosticLegend]="activePlateDiagnosticLegend$ | async"
          [activeLoci]="activeLoci$ | async"
          [inactiveLoci]="inactiveLoci$ | async"
          [selectedLocus]="selectedLocus$ | async"
          [activeLocusDomain]="activeLocusDomain$ | async"
          [activeRecalculatePlateLadderTasks]="activeRecalculatePlateLadderTasks$ | async"
          [activeRecalculateWellLadderTasks]="activeRecalculateWellLadderTasks$ | async"
          [activeUploadPlateMapTasks]="activeUploadPlateMapTasks$ | async"
          [activeDeletePlateTasks]="activeDeletePlateTasks$ | async"
          [failedRecalculatePlateLadderTasks]="failedRecalculatePlateLadderTasks$ | async"
          [failedRecalculateWellLadderTasks]="failedRecalculateWellLadderTasks$ | async"
          [failedUploadPlateMapTasks]="failedUploadPlateMapTasks$ | async"
          [failedDeletePlateTasks]="failedDeletePlateTasks$ | async"
          [activeTasks]="activeTasks$ | async"
          [ladders]="ladders$ | async"
          [createNonExistentSamples]="createNonExistentSamples$ | async"
          (selectWell)="selectWell($event)"
          (selectChannel)="selectChannel($event)"
          (selectLocus)="selectLocus($event)"
          (setPeakIndices)="setPeakIndices($event)"
          (recalculateWellLadder)="recalculateWellLadder()"
          (recalculatePlateLadder)="recalculatePlateLadder($event)"
          (clearPeakIndices)="clearPeakIndices()"
          (uploadPlateMap)="uploadPlateMap($event)"
          (setNonExistentSamples)="setNonExistentSamples($event)"
          (deletePlate)="deletePlate($event)">
        </mspat-plate-details>
      </div>
    </div>
  </div>
  `
})
export class PlatesComponent {
  plates$: Observable<Plate[]>;
  newPlatesLoading$: Observable<boolean>;
  ladders$: Observable<Ladder[]>;
  selectedPlate$: Observable<Plate>;
  plateLoading$: Observable<boolean>;
  ladderRenderable$: Observable<Square[]>;
  channelRenderable$: Observable<{[color: string]: Square[]}>;
  shiftDown$: Observable<Boolean>;
  activeWell$: Observable<Well>;
  wellLoading$: Observable<Boolean>;
  ladderData$: Observable<number[]>;
  baseSizes$: Observable<number[]>;
  peakIndices$: Observable<number[]>;
  activeChannelTraces$: Observable<Trace[]>;
  activeChannelsRange$: Observable<[number, number]>;
  wellEntities$: Observable<{[id: string]: Well}>;
  activePlateDiagnosticTraces$: Observable<Trace[]>;
  activePlateDiagnosticRange$: Observable<[number, number]>;
  activePlateDiagnosticDomain$: Observable<[number, number]>;
  activePlateDiagnosticLegend$: Observable<Legend>;
  activeLoci$: Observable<Locus[]>;
  inactiveLoci$: Observable<Locus[]>;
  activeLocusDomain$: Observable<[number, number]>;
  selectedLocus$: Observable<number>;
  activeRecalculatePlateLadderTasks$: Observable<Task[]>;
  activeRecalculateWellLadderTasks$: Observable<Task[]>;
  activeUploadPlatesTasks$: Observable<Task[]>;
  activeUploadPlateMapTasks$: Observable<Task[]>;
  activeDeletePlateTasks$: Observable<Task[]>;
  failedRecalculatePlateLadderTasks$: Observable<Task[]>;
  failedRecalculateWellLadderTasks$: Observable<Task[]>;
  failedUploadPlatesTasks$: Observable<Task[]>;
  failedUploadPlateMapTasks$: Observable<Task[]>;
  failedDeletePlateTasks$: Observable<Task[]>;
  activeTasks$: Observable<Task[]>;
  createNonExistentSamples$: Observable<boolean>;

  constructor(
    private store: Store<fromRoot.AppState>,
    private plateService: PlateService
  ) {
    this.store.dispatch(new plates.LoadingPlatesAction());
    this.plates$ = this.store.select(fromPlates.selectPlateList);
    this.newPlatesLoading$ = this.store.select(fromPlates.selectNewPlatesLoading);
    this.selectedPlate$ = this.store.select(fromPlates.selectActivePlate);
    this.plateLoading$ = this.store.select(fromPlates.selectPlateLoading);
    this.ladderRenderable$ = this.store.select(fromPlates.selectRenderableLadderInfo);
    this.channelRenderable$ = this.store.select(fromPlates.selectRenderableChannelInfo);
    this.activeWell$ = this.store.select(fromPlates.selectActiveWell);
    this.wellLoading$ = this.store.select(fromPlates.selectWellLoading);
    this.ladderData$ = this.store.select(fromPlates.selectLadderData);
    this.baseSizes$ = this.store.select(fromPlates.selectLadderBaseSizes);
    this.peakIndices$ = this.store.select(fromPlates.selectLadderPeakIndices);
    this.ladders$ = this.store.select(fromPlates.selectLadders);
    this.shiftDown$ = this.store.select(fromKeyboard.selectShiftDown);
    this.wellEntities$ = this.store.select(fromDB.selectWellEntities);
    this.activeChannelTraces$ = this.store.select(fromPlates.selectActiveChannelTraces);
    this.activeChannelsRange$ = this.store.select(fromPlates.selectActiveChannelRange);
    this.activePlateDiagnosticTraces$ = this.store.select(fromPlates.selectActivePlateDiagnosticTraces);
    this.activePlateDiagnosticDomain$ = this.store.select(fromPlates.selectActivePlateDiagnosticDomain);
    this.activePlateDiagnosticRange$ = this.store.select(fromPlates.selectActivePlateDiagnosticRange);
    this.activePlateDiagnosticLegend$ = this.store.select(fromPlates.selectActivePlateDiagnosticLegend);
    this.activeLoci$ = this.store.select(fromPlates.selectActiveChannelLociList);
    this.inactiveLoci$ = this.store.select(fromPlates.selectInactiveLoci);
    this.activeLocusDomain$ = this.store.select(fromPlates.selectActiveLocusDomain);
    this.selectedLocus$ = this.store.select(fromPlates.selectSelectedLocus);

    this.activeRecalculatePlateLadderTasks$ = this.store.select(fromTasks.selectActiveTasks('plate', 'recalculate_ladder'));
    this.failedRecalculatePlateLadderTasks$ = this.store.select(fromTasks.selectFailedTasks('plate', 'recalculate_ladder'));

    this.activeRecalculateWellLadderTasks$ = this.store.select(fromTasks.selectActiveTasks('well', 'recalculate_ladder'));
    this.failedRecalculateWellLadderTasks$ = this.store.select(fromTasks.selectFailedTasks('well', 'recalculate_ladder'));

    this.activeUploadPlatesTasks$ = this.store.select(fromTasks.selectActiveTasks('plate', 'upload_plate'));
    this.failedUploadPlatesTasks$ = this.store.select(fromTasks.selectFailedTasks('plate', 'upload_plate'));

    this.activeUploadPlateMapTasks$ = this.store.select(fromTasks.selectActiveTasks('plate', 'upload_plate_map'));
    this.failedUploadPlateMapTasks$ = this.store.select(fromTasks.selectFailedTasks('plate', 'upload_plate_map'));

    this.activeDeletePlateTasks$ = this.store.select(fromTasks.selectActiveTasks('plate', 'delete'));
    this.failedDeletePlateTasks$ = this.store.select(fromTasks.selectFailedTasks('plate', 'delete'));

    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.createNonExistentSamples$ = this.store.select(fromPlates.selectCreateNonExistentSamples);
  }

  selectPlate(id: number | string) {
    this.store.dispatch(new plates.SelectPlateAction(id));
  }

  selectWell(id: number | string) {
    this.store.dispatch(new plates.SelectWellAction(id));
  }

  selectChannel(id: number | string) {
    this.shiftDown$.pipe(
      take(1))
    .subscribe(shiftDown => {
      if (!shiftDown) {
        this.store.dispatch(new plates.ClearSelectedChannelsAction());
      }
      this.store.dispatch(new plates.SelectChannelAction(id));
    });
  }

  setPeakIndices(indices: number[]) {
    this.store.dispatch(new plates.SetLadderPeakIndicesAction(indices));
  }

  recalculateWellLadder() {
    this.store.dispatch(new plates.RecalculateWellLadderAction());
  }

  recalculatePlateLadder(ladder_id: number | string) {
    this.store.dispatch(new plates.RecalculatePlateLadderAction(ladder_id));
  }

  clearPeakIndices() {
    this.store.dispatch(new plates.SetLadderPeakIndicesAction([]));
  }

  uploadPlateMap(e: UploadPlateMapAction) {
    console.log('Upload Plate Map', e);
    this.plateService.uploadPlateMap(e.plateMap, +e.plateID, e.createNonExistentSamples);
  }

  uploadPlate(e: UploadPlateAction) {
    // this.store.dispatch(new plates.UploadPlatesAction({plateFiles: e.plates, ladderID: +e.ladder}));
    this.plateService.uploadPlate(e.plates, +e.ladder)
    console.log(e);
  }

  deletePlate(e) {
    this.plateService.deletePlate(e)
  }

  setNonExistentSamples(e: MatCheckboxChange) {
    console.log(e);
    this.store.dispatch(new plates.SetNonExistentSamplesAction(e.checked));
  }

  selectLocus(e: MatSelectChange) {
    this.store.dispatch(new plates.ActivateLocusAction(+e.value))
  }


}
