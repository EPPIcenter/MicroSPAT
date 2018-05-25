// import { Component } from '@angular/core';
// // import { GenotypingProjectService } from './services/genotyping-project';
// // import { GenotypingLocusParametersService } from './services/genotyping-locus-params';
// // import { GenotypeService } from './services/genotype';
// import { Store } from '@ngrx/store';

// import { ChannelService } from 'app/services/ce/channel';
// import { LadderService } from 'app/services/ce/ladder';
// import { LocusService } from 'app/services/locus/locus';
// import { GlobalWebSocket } from 'app/services/global';
// import * as fromRoot from 'app/reducers';
// import * as fromDB from 'app/reducers/db';
// // import * as fromPlateList from 'app/reducers/plates/plates';
// import * as _ from 'lodash';
// import { Observable } from 'rxjs/Observable';
// import 'rxjs/add/operator/map';
// import { Plate } from 'app/models/ce/plate';
// import { PlateService } from 'app/services/ce/plate';
// import { WellService } from 'app/services/ce/well';
// import { Channel } from 'app/models/ce/channel';
// import { GenotypingProjectService } from 'app/services/genotyping/project';

// @Component({
//   selector: 'mspat-root',
//   template: `
//     <h3>
//       <li *ngFor="let plate of plates$ | async">
//         {{plate.plate_hash}}
//       </li>
//     </h3>
//   `,
//   // styleUrls: ['./app.component.css']
// })
// export class AppComponent {
//   plates$: Observable<Plate[]>;
//   channels$: Observable<Channel[]>;
//   ioConnection;

//   constructor(
//     private store: Store<fromRoot.AppState>,

//     private ladderService: LadderService,
//     private channelService: ChannelService,
//     private locusService: LocusService,
//     private plateService: PlateService,
//     private wellService: WellService,
//     private genotypingProjectService: GenotypingProjectService,
//     private appReducer: fromRoot.AppReducer,
//     private globalWS: GlobalWebSocket) {
//       // this.channelService.getStream.subscribe(data => {
//       //   console.log(data);
//       // });
//       this.locusService.list();
//       const r = _.range(1, 770).map(n => n.toString());

//       // this.channelService.get(r);

//       this.ladderService.list();
//       // this.ladderService.get('1');
//       this.plateService.list();
//       this.locusService.list();
//       this.locusService.list();
//       this.plateService.get("7");
//       this.plateService.get("7");
//       this.plateService.get("7");
//       this.genotypingProjectService.list();
//       // this.plates$ = this.store.select(fromPlateList.selectPlateList);
//       // this.channels$ = this.store.select(fromDB.selectChannelEntities).map(channels => {
//       //   console.log(channels);
//       //   const c = [];
//       //   for(var key in channels) {
//       //     c.push(channels[key]);
//       //   }
//       //   return c;
//       // });
//     }


// }
