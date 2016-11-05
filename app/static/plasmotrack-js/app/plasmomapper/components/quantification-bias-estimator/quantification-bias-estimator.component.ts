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