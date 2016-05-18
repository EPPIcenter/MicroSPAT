import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { LocusListComponent } from './locus-list.component';
import { LocusDetailComponent } from './locus-detail.component';

@Component({
    selector: 'pm-locus',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'LocusList',
        component: LocusListComponent,
        useAsDefault: true
    },
    {
        path: '/:locus_id',
        name: 'LocusDetail',
        component: LocusDetailComponent,
    }
])
export class LocusComponent {}