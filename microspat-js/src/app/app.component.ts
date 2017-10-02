import { Component } from '@angular/core';
// import { GenotypingProjectService } from './services/genotyping-project';
// import { GenotypingLocusParametersService } from './services/genotyping-locus-params';
// import { GenotypeService } from './services/genotype';
import { Store } from '@ngrx/store';

import { ChannelService } from 'app/services/ce/channel';
import { LadderService } from 'app/services/ce/ladder';
import { LocusService } from 'app/services/locus/locus';
import { GlobalWebSocket } from 'app/services/global';
import * as fromRoot from 'app/reducers';
import * as _ from 'lodash';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'app works!';
  ioConnection;

  constructor(
    private store: Store<fromRoot.State>,
    // private genotypingProjectService: GenotypingProjectService,
    // private genotypingLocusParametersService: GenotypingLocusParametersService,
    // private genotypeService: GenotypeService,
    private ladderService: LadderService,
    private channelService: ChannelService,
    private locusService: LocusService,
    private globalWS: GlobalWebSocket) {
      this.channelService.getStream.subscribe(data => {
        console.log(data);
      });
      this.locusService.list();
      const r = _.range(1, 770).map(n => n.toString());

      // this.channelService.get(r);

      this.ladderService.list();
      this.ladderService.get('1');
      this.locusService.list();
      this.locusService.list();
    // this.genotypingProjectService.getStream.subscribe(data => {
    //   console.log("Got Genotyping Project", data);
    // });
    // this.genotypingProjectService.getStream.subscribe(data => {
    //   console.log("Got Genotyping Project 2", data);
    // });

    // this.genotypingProjectService.listStream.subscribe(data => {
    //   console.log("Got List", data);
    // });
    // this.genotypingProjectService.list();
    // this.genotypingProjectService.get('8');
  }


}
