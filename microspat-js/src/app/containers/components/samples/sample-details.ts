import { Component, ChangeDetectionStrategy, Input, EventEmitter, Output } from '@angular/core';
import { Sample } from 'app/models/sample/sample';
import { Locus } from 'app/models/locus/locus';
import { Trace } from '../plots/canvas';
import { Plate } from 'app/models/ce/plate';
import { EntityMap } from 'app/models/base';
import { ChannelsByLocus } from 'app/reducers/samples/samples';


@Component({
  selector: 'mspat-sample-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="sample-details">
      <mat-card-header>
        <mat-card-title>
          <h5>Sample Details: {{sample.barcode}}</h5>
        </mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div id="trace-plot" *ngIf='sample.detailed && selectedTrace'>
          <mspat-trace-display
            [traces]='[selectedTrace]'
            [domain]='selectedDomain'
            [range]='selectedRange'
            [active]='true'>
          </mspat-trace-display>
        </div>
      </mat-card-content>
    </mat-card>
    <mat-card class="sample-channel-list" *ngIf="!sample.detailed">
      <mat-card-content>
        <mat-spinner diameter="250"></mat-spinner>
      </mat-card-content>
    </mat-card>
    <mat-card class="sample-channel-list" *ngIf="sample.detailed">
      <mat-card-content>
        <h3 *ngIf="channelsByLocus && channelsByLocus.length == 0" > No Runs Exist </h3>
        <mat-accordion *ngIf="channelsByLocus && channelsByLocus.length > 0">
          <mat-expansion-panel *ngFor="let entry of channelsByLocus">
            <mat-expansion-panel-header [collapsedHeight]="'36px'">
              <mat-panel-title>
                {{entry.locus}}
              </mat-panel-title>
            </mat-expansion-panel-header>
              <div class="channel-table">
                <table mat-table [dataSource]="entry.channels">

                  <ng-container matColumnDef="plateLabel">
                    <th mat-header-cell *matHeaderCellDef> Plate </th>
                    <td mat-cell *matCellDef="let element"> {{element.plateLabel}} </td>
                  </ng-container>

                  <ng-container matColumnDef="wellLabel">
                    <th mat-header-cell *matHeaderCellDef> Well </th>
                    <td mat-cell *matCellDef="let element"> {{element.wellLabel}} </td>
                  </ng-container>

                  <ng-container matColumnDef="lastUpdated">
                    <th mat-header-cell *matHeaderCellDef> Last Updated </th>
                    <td mat-cell *matCellDef="let element"> {{element.lastUpdated | date}} </td>
                  </ng-container>

                <ng-container matColumnDef="sizingQuality">
                  <th mat-header-cell *matHeaderCellDef> Sizing Quality </th>
                  <td mat-cell *matCellDef="let element"> {{element.sizingQuality | number}} </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
                <tr mat-row *matRowDef = "let row; columns: displayedColumns;"
                  [style.background] = "row.id === selectedChannelID ? 'lightblue' : ''"
                  (click)="selectChannel.emit(row.id)"></tr>

              </table>
            </div>
          </mat-expansion-panel>
        </mat-accordion>
      </mat-card-content>
    </mat-card>


  `,
  styles: [`
    #trace-plot {
      height: 25vh;
    }

    mat-spinner {
      margin: auto;
    }

    .sample-details {
      height: 36vh;
    }

    .sample-channel-list {
      margin: 10px 0 0 0;
      height: 60vh;
      overflow: auto;
    }

    .channel-table {

    }

    table.mat-table {
      width: 100%;
    }

    .mat-row {
      height: 28px;
    }

    .mat-row:hover {
      background-color: #C3CFE5
    }

    .mat-header-row {
      height: 28px;
    }

    .mat-cell {
      font-size: 10px;
    }

  `]
})
export class SampleDetailsComponent {
  @Input() sample: Sample;
  @Input() channelsByLocus: ChannelsByLocus[];
  @Input() plates: EntityMap<Plate>;
  @Input() loci: EntityMap<Locus>;

  @Input() channelLoading: boolean;

  @Input() selectedChannelID: number;
  @Input() selectedTrace: Trace;
  @Input() selectedDomain: [number, number];
  @Input() selectedRange: [number, number];

  @Output() selectChannel: EventEmitter<number> = new EventEmitter();

  public displayedColumns = ['plateLabel', 'wellLabel', 'lastUpdated', 'sizingQuality'];

}
