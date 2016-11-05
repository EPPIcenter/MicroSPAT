import 'rxjs/Rx'
import { Component, enableProdMode }                        from '@angular/core';
import {RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS}   from '@angular/router-deprecated';

import { PlasmoMapperComponent }                            from './plasmomapper/plasmomapper.component';

@Component({
    selector: 'plasmotrack',
    templateUrl: './app/plasmotrack.component.html',
    styleUrls: ['./app/plasmotrack.component.css'],
    directives: [ROUTER_DIRECTIVES],
    providers: [
        ROUTER_PROVIDERS,
        
    ]
})
@RouteConfig([
    {
        path: '/microspat/...',
        name: 'PlasmoMapper',
        component: PlasmoMapperComponent,
        useAsDefault: true
    },
    
])
export class PlasmoTrackComponent {
    title = "PlasmoTrack";
    
}