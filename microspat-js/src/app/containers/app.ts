import { Component } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';

import { PlateService } from 'app/services/ce/plate';
import { WellService } from 'app/services/ce/well';
import { ChannelService } from 'app/services/ce/channel';
import { LocusService } from 'app/services/locus/locus';
import { KeyboardService } from 'app/services/keyboard';
import { LadderService } from 'app/services/ce/ladder';
import { LocusSetService } from 'app/services/locus/locus-set';
import { SampleService } from 'app/services/sample/sample';
import { BinEstimatorProjectService } from 'app/services/bin-estimator/project';

@Component({
  selector: 'mspat-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container-fluid mspat-container">
      <div class="row">
        <div class="col-1 bg-light sidebar mat-elevation-z6">
          <mspat-sidenav></mspat-sidenav>
        </div>
        <div role="main" class="col-11 ml-sm-auto pt-3">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
})
export class AppComponent {
  constructor(
    private keyboardService: KeyboardService,
    private binEstimatorProjectService: BinEstimatorProjectService,
    private plateService: PlateService,
    private wellService: WellService,
    private channelService: ChannelService,
    private ladderService: LadderService,
    private locusService: LocusService,
    private locusSetService: LocusSetService,
    private sampleService: SampleService

) {
    this.binEstimatorProjectService.list();
    this.plateService.list();
    this.ladderService.list();
    this.locusService.list();
    this.locusSetService.list();
    this.sampleService.list();
  }
}
