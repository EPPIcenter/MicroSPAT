import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { LadderListComponent } from './ladder-list.component';
import { LadderDetailComponent } from './ladder-detail.component';

@Component({
    selector: 'pm-ladder',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
    {
        path: '/',
        name: 'LadderList',
        component: LadderListComponent,
        useAsDefault: true
    },
    {
        path: '/:ladder_id',
        name: 'LadderDetail',
        component: LadderDetailComponent,
    }
])
export class LadderComponent {}
