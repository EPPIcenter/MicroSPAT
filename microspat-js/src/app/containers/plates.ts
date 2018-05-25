import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { tap, take, map, switchMap, mergeMap } from 'rxjs/operators';

import { PlateService } from 'app/services/ce/plate';
import { WellService } from 'app/services/ce/well';

import * as fromRoot from 'app/reducers';
import * as fromPlates from 'app/reducers/plates/plates';
import * as fromDB from 'app/reducers/db';
import * as fromKeyboard from 'app/reducers/keyboard';
import * as plates from 'app/actions/plates';

import { Plate } from 'app/models/ce/plate';
import { Well } from 'app/models/ce/well';
import { LadderService } from 'app/services/ce/ladder';
import { Ladder } from 'app/models/ce/ladder';
import { Square } from 'app/models/square';
import { ChannelService } from 'app/services/ce/channel';
import { Trace, Legend } from 'app/components/plots/canvas';
import { Locus } from 'app/models/locus/locus';

export interface UploadPlateAction {
  plates: FileList;
  ladder: string | number;
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
            (uploadPlate)="uploadPlate($event)"
            ></mspat-plate-uploader>
          </div>
        </div>
        <div class="row">
          <div class="col-sm-12">
            <mspat-plates-list
            [plates]="plates$ | async"
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
          (selectWell)="selectWell($event)"
          (selectChannel)="selectChannel($event)"
          (setPeakIndices)="setPeakIndices($event)"
          (recalculateLadder)="recalculateLadder()"
          (clearPeakIndices)="clearPeakIndices()"
          (uploadPlateMap)="uploadPlateMap($event)">
        </mspat-plate-details>
      </div>
    </div>
  </div>
  `
})
export class PlatesComponent {
  plates$: Observable<Plate[]>;
  ladders$: Observable<Ladder[]>;
  selectedPlate$: Observable<Plate>;
  plateLoading$: Observable<Boolean>;
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

  constructor(
    private store: Store<fromRoot.AppState>,
  ) {
    this.store.dispatch(new plates.LoadingPlatesAction());
    this.plates$ = this.store.select(fromPlates.selectPlateList);
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
    this.activeLoci$ = this.store.select(fromPlates.selectActiveLoci);
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

  recalculateLadder() {
    this.store.dispatch(new plates.RecalculateLadderAction());
  }

  clearPeakIndices() {
    this.store.dispatch(new plates.SetLadderPeakIndicesAction([]));
  }

  uploadPlateMap(e) {
    console.log("Upload Plate Map", e);
  }

  uploadPlate(e: UploadPlateAction) {
    console.log(e);
  }

}
