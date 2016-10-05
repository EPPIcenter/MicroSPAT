import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { QuantificationBiasEstimatorListComponent } from './quantification-bias-estimator-list.component';
import { QuantificationBiasEstimatorDetailComponent } from './quantification-bias-estimator-detail.component';
import { QuantificationBiasEstimatorLocusListComponent } from './loci/quantification-bias-estimator-locus-list.component';


@Component({
    selector: 'pm-quantification-bias-estimator',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'QuantificationBiasEstimatorList',
        component: QuantificationBiasEstimatorListComponent,
        useAsDefault: true
    },
    {
        path: '/:project_id',
        name: 'QuantificationBiasEstimatorDetail',
        component: QuantificationBiasEstimatorDetailComponent
    },
    {
        path: '/:project_id/loci',
        name: 'QuantificationBiasEstimatorLocusList',
        component: QuantificationBiasEstimatorLocusListComponent
    }
])
export class QuantifiactionBiasEstimatorComponent {
    
}