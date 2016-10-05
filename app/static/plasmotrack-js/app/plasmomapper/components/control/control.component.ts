import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { ControlListComponent } from './control-list.component';
// import { LocusDetailComponent } from './locus-detail.component';

@Component({
    selector: 'pm-control',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'ControlList',
        component: ControlListComponent,
        useAsDefault: true
    },
    // {
    //     path: '/:locus_id',
    //     name: 'LocusDetail',
    //     component: LocusDetailComponent,
    // }
])
export class ControlComponent {}