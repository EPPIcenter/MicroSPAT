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

import { BinEstimatorListComponent } from './bin-estimator-list.component';
import { BinEstimatorDetailComponent } from './bin-estimator-detail.component';
import { BinEstimatorLocusListComponent } from './loci/bin-estimator-locus-list.component';


@Component({
    selector: 'pm-bin-estimator',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'BinEstimatorList',
        component: BinEstimatorListComponent,
        useAsDefault: true
    },
    {
        path: '/:project_id',
        name: 'BinEstimatorDetail',
        component: BinEstimatorDetailComponent
    },
    {
        path: '/:project_id/loci',
        name: 'BinEstimatorLocusList',
        component: BinEstimatorLocusListComponent
    }
])
export class BinEstimatorComponent {
    
}