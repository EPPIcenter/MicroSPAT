import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { SampleListComponent } from './sample-list.component';

@Component({
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES] 
})
@RouteConfig([
    {
        path: '/',
        name: 'SampleList',
        component: SampleListComponent,
        useAsDefault: true
    }
])
export class SampleComponent {}