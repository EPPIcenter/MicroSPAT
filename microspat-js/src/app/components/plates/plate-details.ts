import { Component, Input, EventEmitter, Output, ChangeDetectionStrategy } from '@angular/core';
import { Plate } from 'app/models/ce/plate';
import { Square } from 'app/models/square';
import { OnChanges } from '@angular/core/src/metadata/lifecycle_hooks';
import { Trace, Legend } from 'app/components/plots/canvas';
import { selectActivePlateDiagnosticLegend } from 'app/reducers/plates/plates';
import { Well } from 'app/models/ce/well';
import { Locus } from 'app/models/locus/locus';

@Component({
  selector: 'mspat-plate-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `

    <mat-card *ngIf="showPlateCard" class="plate-details">
      <mat-card-content *ngIf="plateLoading">
        <mat-progress-spinner mode="indeterminate"></mat-progress-spinner>
      </mat-card-content>
      <mat-card-content *ngIf="plate">
        <mat-tab-group>
          <mat-tab [label]="'Details'">
            <div class="details-container">
              <mat-form-field [floatLabel]="'always'">
                <mat-label>Label</mat-label>
                <input matInput [value]="plate.label" disabled="true">
              </mat-form-field>
              <mat-form-field [floatLabel]="'always'" >
                <mat-label>Date Run</mat-label>
                <input matInput [value]="plate.date_run | date" disabled="true">
              </mat-form-field>
              <mat-form-field [floatLabel]="'always'" >
                <mat-label>Date Processed</mat-label>
                <input matInput [value]="plate.date_processed | date" disabled="true">
              </mat-form-field>
              <mat-form-field [floatLabel]="'always'" >
                <mat-label>CE Machine</mat-label>
                <input matInput [value]="plate.ce_machine" disabled="true">
              </mat-form-field>
            </div>
            <div class="details-controller">
              <h6>Select Plate Map</h6>
              <input type="file" (change)="plateMapChangeEvent($event)" placeholder="Select Plate Map"/>
              <br>
              <button mat-raised-button color="primary" [disabled]="!plateMapFile" (click)="uploadPlateMap.emit(this.plateMapFile)">Upload</button> <span *ngIf="warning" class="mspat-warning">{{warning}}</span>
            </div>
          </mat-tab>
          <mat-tab #ladderTab [label]="'Ladder'">
            <mat-grid-list cols="8" rowHeight="80px">
              <mat-grid-tile *ngIf="ladderRenderable"
                [colspan] = "3"
                [rowspan] = "2">
                <mspat-plate-plot class="plate-plot"
                  [squares] = "ladderRenderable"
                  [wellArrangement] = "plate.well_arrangement"
                  [active] = "ladderTab.isActive"
                  (wellSelected) = "selectWell.emit($event)">
                </mspat-plate-plot>
              </mat-grid-tile>
              <mat-grid-tile
                [colspan] = "5"
                [rowspan] = "2">
              LADDER DETAILS
              </mat-grid-tile>
              <mat-grid-tile *ngIf="wellLoading"
                [colspan] = "8"
                [rowspan] = "3">
                <mat-progress-spinner mode="indeterminate"></mat-progress-spinner>
              </mat-grid-tile>
              <mat-grid-tile *ngIf="ladderData"
                [colspan] = "8"
                [rowspan] = "6">
                  <mspat-ladder-editor class="trace-container"
                    [data] = "ladderData"
                    [baseSizes] = "baseSizes"
                    [peakIndices] = "peakIndices"
                    [activeWell] = "activeWell"
                    [active] = "ladderTab.isActive"
                    (setPeakIndices) = "setPeakIndices.emit($event)"
                    (recalculateLadder) = "recalculateLadder.emit()"
                    (clearPeakIndices) = "clearPeakIndices.emit()">
                  </mspat-ladder-editor>
              </mat-grid-tile>
            </mat-grid-list>
          </mat-tab>
          <mat-tab #channelTab [label] = "'Channels'">
            <mat-grid-list cols="4" rowHeight="80px" gutterSize="5px">
              <mat-grid-tile *ngFor="let channelConfig of channelConfigs"
                [colspan] = "2"
                [rowspan] = "2">
                  <mat-grid-tile-header class="channel-header unselectable">{{channelConfig.label | titlecase}}</mat-grid-tile-header>
                  <mspat-plate-plot class="plate-plot"
                    [squares] = "channelConfig.squares"
                    [wellArrangement] = "plate.well_arrangement"
                    [active] = "channelTab.isActive"
                    (wellSelected) = "selectChannel.emit($event)">
                  </mspat-plate-plot>
              </mat-grid-tile>
              <mat-grid-tile
                [colspan] = "4"
                [rowspan] = "4">
                <mspat-trace-display class="trace-container"
                  [traces]="activeChannelTraces"
                  [range]="activeChannelsRange"
                  [active] = "channelTab.isActive">
                </mspat-trace-display>
                <ul>
                  <li *ngFor="let locus of activeLoci">{{locus.label}}</li>
                </ul>
              </mat-grid-tile>
            </mat-grid-list>
          </mat-tab>
          <mat-tab #diagnosticTab [label]="'Diagnostics'">
            <mat-grid-list cols="4" rowHeight="80px" gutterSize="5px">
              <mat-grid-tile
                [colspan] = "4"
                [rowspan] = "4">
                <mspat-trace-display class="trace-container"
                  [traces]="activePlateDiagnosticTraces"
                  [range]="activePlateDiagnosticRange"
                  [domain]="activePlateDiagnosticDomain"
                  [legend]="activePlateDiagnosticLegend"
                  [active]="diagnosticTab.isActive">
                </mspat-trace-display>
              </mat-grid-tile>
            </mat-grid-list>
          </mat-tab>
        </mat-tab-group>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .details-container {
      width: 100%;
      float: left;
      display: flex;
      flex-direction: column;
    }

    .details-controller {
      width: 100%;
      float: right;
      display: flex;
      flex-direction: column;
    }

    .details-container > * {
      width: 100%;
    }

    .details-field {
      width: 100%;
    }

    .trace-container {
      width: 100%;
      height: 100%;
    }

    .plate-details {
      padding: 10px;
    }

    .plate-plot {
      width: 100%;
      height: 100%;
    }

    .mat-grid-tile-header {
      pointer-events: none;
      background: rgba(0, 0, 0, .15) !important;
    }
  `]
})
export class PlateDetailsComponent implements OnChanges {
  @Input() plate: Plate;
  @Input() plateLoading: boolean;

  @Input() ladderRenderable: Square[];
  @Input() channelRenderable: {[color: string]: Square[]};

  @Input() activeWell: Well;
  @Input() wellLoading: boolean;
  @Input() ladderData: number[];
  @Input() baseSizes: number[];
  @Input() peakIndices: number[];

  @Input() activeChannelTraces: Trace[];
  @Input() activeChannelsRange: [number, number];
  @Input() activeLoci: Locus[];

  @Input() activePlateDiagnosticTraces: Trace[];
  @Input() activePlateDiagnosticRange: [number, number];
  @Input() activePlateDiagnosticDomain: [number, number];
  @Input() activePlateDiagnosticLegend: Legend;


  @Output() selectWell = new EventEmitter();
  @Output() selectChannel = new EventEmitter();
  @Output() setPeakIndices = new EventEmitter();
  @Output() recalculateLadder = new EventEmitter();
  @Output() clearPeakIndices = new EventEmitter();
  @Output() uploadPlateMap = new EventEmitter();


  private channelConfigs;
  private plateMapFile;

  ngOnChanges() {
    this.setChannelConfigs();
  }

  setChannelConfigs() {
    if (!this.channelRenderable) { return; };
    this.channelConfigs = Object.keys(this.channelRenderable).map(color => {
      return {
        label: color,
        squares: this.channelRenderable[color]
      };
    });
  }

  get showPlateCard() {
    return this.plateLoading || this.plate;
  }

  plateMapChangeEvent(e) {
    if (e && e.target.files.length > 0) {
      this.plateMapFile = e.target.files[0];
    } else {
      this.plateMapFile = null;
    }
  }

}

