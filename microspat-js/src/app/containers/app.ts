import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs';
import { Plate } from 'app/models/ce/plate';
import * as fromRoot from 'app/reducers';
import { PlateService } from 'app/services/ce/plate';
import { WellService } from 'app/services/ce/well';
import { ChannelService } from 'app/services/ce/channel';
import { LocusService } from 'app/services/locus/locus';
import { KeyboardService } from 'app/services/keyboard';
import * as plates from 'app/actions/plates';
import { LadderService } from 'app/services/ce/ladder';
import { LocusSetService } from '../services/locus/locus-set';

@Component({
  selector: 'mspat-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container-fluid mspat-container">
      <div class="row">
        <div class="col-1 bg-light sidebar">
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
    private plateService: PlateService,
    private wellService: WellService,
    private channelService: ChannelService,
    private ladderService: LadderService,
    private locusService: LocusService,
    private locusSetService: LocusSetService

) {
    this.plateService.list();
    this.ladderService.list();
    this.locusService.list();
    this.locusSetService.list();
  }
}
