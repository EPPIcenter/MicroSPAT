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

import { QuantificationBiasEstimatorProjectListComponent } from './quantification-bias-estimator-list.component';
import { QuantificationBiasEstimatorProjectDetailComponent } from './quantification-bias-estimator-details/quantification-bias-estimator-detail.component';
import { QuantificationBiasEstimatorProjectSampleList } from './quantification-bias-estimator-details/samples/quantification-bias-estimator-sample-list.component';
import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';

import { QuantificationBiasEstimatorProjectLocusListComponent } from './quantification-bias-estimator-details/loci/quantification-bias-estimator-locus-list.component';

@Component({
    selector: 'pm-quantification-bias-estimator',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'QuantificationBiasEstimatorProjectList',
        component: QuantificationBiasEstimatorProjectListComponent,
        useAsDefault: true
    },
    {
        path: '/:project_id',
        name: 'QuantificationBiasEstimatorProjectDetail',
        component: QuantificationBiasEstimatorProjectDetailComponent
    },
    {
        path: '/:project_id/samples',
        name: 'QuantificationBiasEstimatorProjectSampleList',
        component: QuantificationBiasEstimatorProjectSampleList
    },
    {
        path: '/:project_id/loci',
        name: 'QuantificationBiasEstimatorProjectLocusList',
        component: QuantificationBiasEstimatorProjectLocusListComponent
    }
])
export class QuantificationBiasEstimatorProjectComponent {
    constructor(
        private _binService: BinEstimatorProjectService
    ) {}

}