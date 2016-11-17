// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

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
import { QuantificationBiasEstimatorProjectComponent } from './components/quantification-bias-estimator/quantification-bias-estimator.component';
import { PlateComponent } from './components/plate/plate.component';
import { SampleComponent } from './components/sample/sample.component';
import { LocusComponent } from './components/locus/locus.component';
import { LocusSetComponent } from './components/locus-set/locus-set.component';
import { LadderComponent } from './components/ladder/ladder.component';
import { ControlComponent } from './components/control/control.component';

import { GenotypingProjectService } from './services/genotyping-project/genotyping-project.service';
import { ArtifactEstimatorProjectService } from './services/artifact-estimator-project/artifact-estimator-project.service';
import { BinEstimatorProjectService } from './services/bin-estimator-project/bin-estimator-project.service';
import { QuantificationBiasEstimatorProjectService } from './services/quantification-bias-estimator-project/quantification-bias-estimator-project.service';
import { ChannelService } from './services/channel/channel.service';
import { LocusSetService } from './services/locus-set/locus-set.service';
import { PlateService } from './services/plate/plate.service';
import { LocusService } from './services/locus/locus.service';
import { ProjectService } from './services/project/project.service';
import { LadderService } from './services/ladder/ladder.service';
import { SampleService } from './services/sample/sample.service';
import { WellService } from './services/well/well.service';
import { NotificationService } from './services/notifications/notification.service';
import { ControlService } from './services/control/control.service';

@Component({
    selector: 'plasmomapper',
    template: `
    <div class="container-fluid">
        <div class="row">
            <div class="col-sm-1 sidebar">
                <ul class="nav nav-sidebar">
                    <li><a [routerLink]="['Plate']">Plates</a></li>
                    <li><a [routerLink]="['Sample']">Samples</a></li>
                    <li><a [routerLink]="['Control']">Controls</a></li>
                    <li><a [routerLink]="['GenotypingProject']">Genotyping Projects</a></li>
                    <li><a [routerLink]="['ArtifactEstimatingProject']">Artifact Estimators</a></li>
                    <li><a [routerLink]="['BinEstimatorProject']">Bin Estimators</a></li>
                    <li><a [routerLink]="['QuantificationBiasEstimatorProject']">Quantification Bias Estimators</a></li>
                    <li><a [routerLink]="['Locus']">Loci</a></li>
                    <li><a [routerLink]="['LocusSet']">Locus Sets</a></li>
                    <li><a [routerLink]="['Ladder']">Ladders</a></li>
                </ul>
            </div>
            <div class="col-sm-11 col-sm-offset-1 main">
                <router-outlet></router-outlet>
            </div>
        </div>
    </div>
    `,
    // templateUrl: 'app/plasmomapper/plasmomapper.component.html',
    styleUrls: ['app/plasmomapper/plasmomapper.component.css'],
    directives: [ROUTER_DIRECTIVES],
    providers: [
        CommonServerMethods, ProjectServerMethods, GenotypingProjectService, QuantificationBiasEstimatorProjectService,
        ChannelService, LocusSetService, PlateService, LocusService, ProjectService,
        ArtifactEstimatorProjectService, BinEstimatorProjectService, LadderService,
        SampleService, WellService, NotificationService, ControlService
    ]
})
@RouteConfig([
    {
        path: '/genotyping-projects/...',
        name: 'GenotypingProject',
        component: GenotypingProjectComponent,
    },
    {
        path: '/quantification-bias-estimators/...',
        name: 'QuantificationBiasEstimatorProject',
        component: QuantificationBiasEstimatorProjectComponent,
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
        component: PlateComponent,
        useAsDefault: true
    },
    {
        path: '/samples/...',
        name: 'Sample',
        component: SampleComponent
    },
    {
        path: '/ladders/...',
        name: 'Ladder',
        component: LadderComponent
    },
    {
        path: '/controls/...',
        name: 'Control',
        component: ControlComponent
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
        private _notificationService: NotificationService,
        private _plateService: PlateService,
        private _controlService: ControlService
    ) {

    }
    
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
        this.initServices();
    }
}