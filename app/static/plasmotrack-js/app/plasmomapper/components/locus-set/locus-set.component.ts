import { Component, OnInit } from 'angular2/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from 'angular2/router';

import { LocusSetListComponent } from './locus-set-list.component';
// import { LocusSetDetailComponent } from './locus-set-detail.component';

@Component({
    selector: 'pm-locus-set',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'LocusSetList',
        component: LocusSetListComponent,
        useAsDefault: true
    },
    // {
    //     path: '/:locus_set_id',
    //     name: 'LocusSetDetail',
    //     component: LocusSetDetailComponent,
    // }
])
export class LocusSetComponent {}