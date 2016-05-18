import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { PlateListComponent } from './plate-list.component';
import { PlateDetailComponent } from './plate-detail.component';

@Component({
    selector: 'pm-plate',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'PlateList',
        component: PlateListComponent,
        useAsDefault: true
    },
    {
        path: '/:plate_id',
        name: 'PlateDetail',
        component: PlateDetailComponent,
    }
])
export class PlateComponent {}