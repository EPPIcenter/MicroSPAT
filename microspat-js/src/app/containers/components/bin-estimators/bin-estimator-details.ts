import { Component, ChangeDetectionStrategy, Input, Output } from '@angular/core';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';


@Component({
  selector: 'mspat-bin-estimator-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bin-estimator-details mat-elevation-z8">
      <mat-tab-group>

        <mat-tab label="Details">
        
        </mat-tab>

        <mat-tab label="Samples">
        </mat-tab>

        <mat-tab label="Loci">
        </mat-tab>

      </mat-tab-group>
    </div>
  `,
  styles: [`
    .bin-estimator-details {
      height: 95vh;
    }
  `]


})
export class BinEstimatorDetailsComponent {
  @Input() binEstimator: BinEstimatorProject

  constructor() {}
}
