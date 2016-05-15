import { Component, OnInit } from 'angular2/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from 'angular2/router';

import { ArtifactEstimatorListComponent } from './artifact-estimator-list.component';
import { ArtifactEstimatorDetailComponent } from './artifact-estimator-detail.component';
import { ArtifactEstimatorLocusListComponent } from './loci/artifact-estimator-locus-list.component';

@Component({
    selector: 'pm-artifact-estimator',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'ArtifactEtimatorList',
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
    }
])
export class ArtifactEstimatorComponent {
    
}