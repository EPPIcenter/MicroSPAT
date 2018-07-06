import { Component, Input, EventEmitter, Output, ChangeDetectionStrategy } from '@angular/core';
import { Plate } from 'app/models/ce/plate';
import { Square } from 'app/models/square';
import { OnChanges } from '@angular/core/src/metadata/lifecycle_hooks';
import { Trace, Legend } from 'app/containers/components/plots/canvas';
import { selectActivePlateDiagnosticLegend } from 'app/reducers/plates/plates';
import { Well } from 'app/models/ce/well';
import { Locus } from 'app/models/locus/locus';
import { Ladder } from 'app/models/ce/ladder';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-plate-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `

    <mat-card *ngIf="showPlateCard" class="plate-details">
      <mat-card-content *ngIf="plateLoading">
        <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
      </mat-card-content>
      <mat-card-content *ngIf="plate">
        <mat-tab-group>
          <mat-tab [disabled]="tasksActive" [label]="'Details'">
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
              <button mat-raised-button
               color='warn'
               (click)="deletePlate.emit(plate.id)"
               [disabled]='tasksActive'>
                DELETE PLATE
               </button>
              <mspat-task-progress-display *ngIf="activeDeletePlateTask" [task]="activeDeletePlateTask"></mspat-task-progress-display>
              <mspat-task-progress-display *ngIf="failedDeletePlateTask" [task]="failedDeletePlateTask"></mspat-task-progress-display>
            </div>
            <div>
              <div class="details-controller">
                <h6>Select Plate Map</h6>
                <input type="file" (change)="plateMapChangeEvent($event)" placeholder="Select Plate Map"/>
                <br>
                <mat-checkbox
                  [disabled]="tasksActive"
                  [checked]="createNonExistentSamples"
                  (change)="setNonExistentSamples.emit($event)">
                  Create Non-Existent Samples
                </mat-checkbox>
                <button mat-raised-button color="primary"
                  [disabled]="!plateMapFile || tasksActive"
                  (click)="uploadPlateMap.emit({plateMap: this.plateMapFile, plateID: this.plate.id, createNonExistentSamples: this.createNonExistentSamples})">
                  UPLOAD PLATE MAP
                </button>
                <span *ngIf="warning" class="mspat-warning">{{warning}}</span>
                <mspat-task-progress-display *ngIf="activeUploadPlateMapTask" [task]="activeUploadPlateMapTask"></mspat-task-progress-display>
                <mspat-task-progress-display *ngIf="failedUploadPlateMapTask" [task]="failedUploadPlateMapTask"></mspat-task-progress-display>
              </div>
            </div>
          </mat-tab>
          <mat-tab [disabled]="tasksActive" #ladderTab [label]="'Ladder'">
            <mat-grid-list *ngIf="ladderTab.isActive" cols="8" rowHeight="80px">
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
                <mat-card style="width:100%; height:100%">
                  <mat-card-content>
                    <mspat-task-progress-display *ngIf="activeRecalculatePlateLadderTask" [task]="activeRecalculatePlateLadderTask"></mspat-task-progress-display>
                    <mspat-task-progress-display *ngIf="failedRecalculatePlateLadderTask" [task]="failedRecalculatePlateLadderTask"></mspat-task-progress-display>
                  </mat-card-content>
                  <mat-card-actions>
                    <button mat-raised-button [matMenuTriggerFor]="changeLadderMenu" [disabled]="tasksActive">CHANGE LADDER</button>
                    <mat-menu #changeLadderMenu="matMenu">
                      <button mat-menu-item *ngFor="let ladder of ladders" (click)="recalculatePlateLadder.emit(ladder.id)"> {{ladder.label}} </button>
                    </mat-menu>
                  </mat-card-actions>
                </mat-card>
              </mat-grid-tile>
              <mat-grid-tile *ngIf="wellLoading"
                [colspan] = "8"
                [rowspan] = "3">
                <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
              </mat-grid-tile>
              <mat-grid-tile *ngIf="ladderData"
                [colspan] = "8"
                [rowspan] = "6">
                  <mspat-well-ladder-editor class="trace-container"
                    [data] = "ladderData"
                    [baseSizes] = "baseSizes"
                    [peakIndices] = "peakIndices"
                    [activeWell] = "activeWell"
                    [active] = "ladderTab.isActive"
                    [recalculateLadderTask] = "activeRecalculateWellLadderTask"
                    [failedRecalculateLadderTask] = "failedRecalculateLadderTask"
                    [tasksActive] = "tasksActive"
                    (setPeakIndices) = "setPeakIndices.emit($event)"
                    (recalculateWellLadder) = "recalculateWellLadder.emit()"
                    (clearPeakIndices) = "clearPeakIndices.emit($event)">
                  </mspat-well-ladder-editor>
              </mat-grid-tile>
            </mat-grid-list>
          </mat-tab>
          <mat-tab [disabled]="tasksActive" #channelTab [label] = "'Channels'">
            <mat-grid-list *ngIf="channelTab.isActive" cols="4" rowHeight="80px" gutterSize="5px">
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
                  [domain]="activeLocusDomain"
                  [active]="channelTab.isActive">
                </mspat-trace-display>
                <mat-form-field class="locus-window-selector">
                  <mat-select placeholder="Select Locus"
                   [value]='selectedLocus'
                   (selectionChange)='selectLocus.emit($event)'>
                    <mat-option [value]='null'> None </mat-option>
                    <mat-optgroup [label]="'Active Loci'">
                      <mat-option *ngFor="let locus of activeLoci" [value]="+locus.id">{{locus.label}} ({{locus.color}})</mat-option>
                    </mat-optgroup>
                    <mat-optgroup [label]="'Inactive Loci'">
                      <mat-option *ngFor="let locus of inactiveLoci" [value]="+locus.id">{{locus.label}} ({{locus.color}})</mat-option>
                    </mat-optgroup>
                  </mat-select>
                </mat-form-field>
              </mat-grid-tile>
            </mat-grid-list>
          </mat-tab>
          <mat-tab [disabled]="tasksActive" #diagnosticTab [label]="'Diagnostics'">
            <mat-grid-list *ngIf="diagnosticTab.isActive" cols="4" rowHeight="80px" gutterSize="5px">
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
    mat-spinner {
      margin: 0 auto
    }

    .locus-window-selector {
      margin: 5px;
    }

    .details-container {
      width: 100%;
      float: left;
      display: flex;
      flex-direction: column;
      padding-bottom: 15px;
    }

    .details-controller {
      width: 100%;
      float: right;
      display: flex;
      flex-direction: column;
    }

    .details-controller button {
      margin: 5px;
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
  @Input() activeLocusDomain: [number, number];
  @Input() selectedLocus: number;
  @Input() activeLoci: Locus[];
  @Input() inactiveLoci: Locus[];

  @Input() activePlateDiagnosticTraces: Trace[];
  @Input() activePlateDiagnosticRange: [number, number];
  @Input() activePlateDiagnosticDomain: [number, number];
  @Input() activePlateDiagnosticLegend: Legend;

  @Input() ladders: Ladder[];

  @Input() activeRecalculatePlateLadderTasks: Task[];
  @Input() activeRecalculateWellLadderTasks: Task[];
  @Input() activeUploadPlateMapTasks: Task[];
  @Input() activeDeletePlateTasks: Task[];

  @Input() failedRecalculatePlateLadderTasks: Task[];
  @Input() failedRecalculateWellLadderTasks: Task[];
  @Input() failedUploadPlateMapTasks: Task[];
  @Input() failedDeletePlateTasks: Task[];

  @Input() activeTasks: Task[];

  @Input() createNonExistentSamples: boolean;

  @Output() selectWell = new EventEmitter();
  @Output() selectChannel = new EventEmitter();
  @Output() setPeakIndices = new EventEmitter();
  @Output() recalculateWellLadder = new EventEmitter();
  @Output() clearPeakIndices = new EventEmitter();
  @Output() uploadPlateMap = new EventEmitter();
  @Output() recalculatePlateLadder = new EventEmitter();
  @Output() setNonExistentSamples = new EventEmitter();
  @Output() deletePlate = new EventEmitter();
  @Output() selectLocus = new EventEmitter();


  private channelConfigs;
  private plateMapFile;

  private activeLocus;

  private spinnerDiameter = 250;

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

  get tasksActive() {
    return this.activeTasks.length > 0;
  }

  get activeRecalculatePlateLadderTask() {
    const activeTask = this.activeRecalculatePlateLadderTasks.filter(t => +t.task_args['plate_id'] === +this.plate.id);
    if (activeTask.length > 0) {
      return activeTask[0];
    } else {
      return false;
    }
  }

  get activeRecalculateWellLadderTask() {
    const activeTask = this.activeRecalculatePlateLadderTasks.filter(t => +t.task_args['well_id'] === +this.activeWell.id);
    if (activeTask.length > 0) {
      return activeTask[0];
    } else {
      return false;
    }
  }

  get activeUploadPlateMapTask() {
    const activeTask = this.activeUploadPlateMapTasks.filter(t => +t.task_args['plate_id'] === +this.plate.id);
    if (activeTask.length > 0) {
      return activeTask[0];
    } else {
      return false;
    }
  }

  get activeDeletePlateTask() {
    const activeTask = this.activeDeletePlateTasks.filter(t => +t.task_args['plate_id'] === +this.plate.id);
    if (activeTask.length > 0) {
      return activeTask[0]
    } else {
      return false;
    }
  }

  get failedRecalculatePlateLadderTask() {
    const failedTask = this.failedRecalculatePlateLadderTasks.filter(t => +t.task_args['plate_id'] === +this.plate.id);
    if (failedTask.length > 0) {
      return failedTask[0];
    } else {
      return false;
    }
  }

  get failedRecalculateWellLadderTask() {
    const failedTask = this.failedRecalculatePlateLadderTasks.filter(t => +t.task_args['well_id'] === +this.activeWell.id);
    if (failedTask.length > 0) {
      return failedTask[0];
    } else {
      return false;
    }
  }

  get failedUploadPlateMapTask() {
    const failedTask = this.failedUploadPlateMapTasks.filter(t => +t.task_args['plate_id'] === +this.plate.id);
    if (failedTask.length > 0) {
      return failedTask[0];
    } else {
      return false;
    }
  }

  get failedDeletePlateTask() {
    const failedTask = this.failedDeletePlateTasks.filter(t => +t.task_args['plate_id'] === +this.plate.id);
    if (failedTask.length > 0) {
      return failedTask[0]
    } else {
      return false;
    }
  }

  plateMapChangeEvent(e) {
    if (e && e.target.files.length > 0) {
      this.plateMapFile = e.target.files[0];
    } else {
      this.plateMapFile = null;
    }
  }

}

