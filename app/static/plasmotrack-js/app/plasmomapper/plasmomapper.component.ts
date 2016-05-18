import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { Observer } from 'rxjs/Observer';
import { Subscriber } from 'rxjs/Subscriber';

import { CommonServerMethods } from './services/utils/ServerMethods';
import { ProjectServerMethods } from './services/project/project-server-methods';

import { DashboardComponent } from './dashboard.component';

import { GenotypingProjectComponent } from './components/genotyping-project/genotyping-project.component'
import { BinEstimatorComponent } from './components/bin-estimator/bin-estimator.component';
import { ArtifactEstimatorComponent } from './components/artifact-estimator/artifact-estimator.component';
import { PlateComponent } from './components/plate/plate.component';
import { SampleComponent } from './components/sample/sample.component';
import { LocusComponent } from './components/locus/locus.component';
import { LocusSetComponent } from './components/locus-set/locus-set.component';

import { GenotypingProjectService } from './services/genotyping-project/genotyping-project.service';
import { ArtifactEstimatorProjectService } from './services/artifact-estimator-project/artifact-estimator-project.service';
import { BinEstimatorProjectService } from './services/bin-estimator-project/bin-estimator-project.service';
import { ChannelService } from './services/channel/channel.service';
import { LocusSetService } from './services/locus-set/locus-set.service';
import { PlateService } from './services/plate/plate.service';
import { LocusService } from './services/locus/locus.service';
import { ProjectService } from './services/project/project.service';
import { LadderService } from './services/ladder/ladder.service';
import { SampleService } from './services/sample/sample.service';
import { WellService } from './services/well/well.service';
import { NotificationService } from './services/notifications/notification.service';

@Component({
    selector: 'plasmomapper',
    templateUrl: 'app/plasmomapper/plasmomapper.component.html',
    styleUrls: ['app/plasmomapper/plasmomapper.component.css'],
    directives: [ROUTER_DIRECTIVES],
    providers: [
        CommonServerMethods, ProjectServerMethods, GenotypingProjectService, 
        ChannelService, LocusSetService, PlateService, LocusService, ProjectService,
        ArtifactEstimatorProjectService, BinEstimatorProjectService, LadderService,
        SampleService, WellService, NotificationService
    ]
})
@RouteConfig([
    {
        path: '/genotyping-projects/...',
        name: 'GenotypingProject',
        component: GenotypingProjectComponent,
        useAsDefault: true
    },
    {
        path: '/artifact-estimators/...',
        name: 'ArtifactEstimatingProject',
        component: ArtifactEstimatorComponent
    },
    {
        path: '/bin-estimators/...',
        name: 'BinEstimatorProject',
        component: BinEstimatorComponent,
    },
    {
        path: '/loci/...',
        name: 'Locus',
        component: LocusComponent,
    },
    {
        path: '/locus-sets/...',
        name: 'LocusSet',
        component: LocusSetComponent,
    },
    {
        path: '/plates/...',
        name: 'Plate',
        component: PlateComponent
    },
    {
        path: '/samples/...',
        name: 'Sample',
        component: SampleComponent
    }
    // {
    //     path: '/',
    //     name: 'PlasmoMapperDashboard',
    //     component: DashboardComponent,
    //     useAsDefault: true
    // }
])

export class PlasmoMapperComponent implements OnInit {
    public title = "PlasmoMapper";
    public errorMessage: string;
    
    constructor(
        private _ladderService: LadderService,
        private _locusService: LocusService,
        private _locusSetService: LocusSetService,
        private _notificationService: NotificationService
    ) {}
    
    initServices() {
        this._ladderService.getLadders().subscribe(
            ladders => {
                ladders.forEach(ladder => this._ladderService.getLadder(ladder.id).subscribe());
            }
        )
        
        this._locusService.getLoci().subscribe(
            loci => {
                loci.forEach(locus => this._locusService.getLocus(locus.id).subscribe())
            }
        )
        
        this._locusSetService.getLocusSets().subscribe(
            locusSets => {
                locusSets.forEach(locusSet => this._locusSetService.getLocusSet(locusSet.id).subscribe())
            }
        )
    }
    
    ngOnInit() {
        console.log("Initializing PlasmoMapper");
        
        this.initServices();
    }
}