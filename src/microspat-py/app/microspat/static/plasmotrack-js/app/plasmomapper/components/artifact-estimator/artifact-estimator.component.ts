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

import { ArtifactEstimatorListComponent } from './artifact-estimator-list.component';
import { ArtifactEstimatorDetailComponent } from './artifact-estimator-detail.component';
import { ArtifactEstimatorLocusListComponent } from './loci/artifact-estimator-locus-list.component';
import { ArtifactEstimatorSampleListComponent } from './samples/artifact-estimator-sample-list.component';

@Component({
    selector: 'pm-artifact-estimator',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'ArtifactEstimatorList',
        component: ArtifactEstimatorListComponent,
        useAsDefault: true
    },
    {
        path: '/:project_id',
        name: 'ArtifactEstimatorDetail',
        component: ArtifactEstimatorDetailComponent
    },
    {
        path: '/:project_id/loci',
        name: 'ArtifactEstimatorLocusList',
        component: ArtifactEstimatorLocusListComponent
    },
    {
        path: '/:project_id/samples',
        name: 'ArtifactEstimatorSampleList',
        component: ArtifactEstimatorSampleListComponent
    }
])
export class ArtifactEstimatorComponent {
    
}