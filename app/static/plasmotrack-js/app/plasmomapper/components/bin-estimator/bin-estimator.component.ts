import { Component, OnInit } from 'angular2/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from 'angular2/router';

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