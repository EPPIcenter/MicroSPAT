import 'rxjs/Rx'
import { Component, enableProdMode }                        from '@angular/core';
import {RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS}   from '@angular/router-deprecated';

import { PlasmoMapperComponent }                            from './plasmomapper/plasmomapper.component';
import { SampleListComponent }                              from './plasmomapper/components/project/samples-list.component';


@Component({
    selector: 'plasmotrack',
    templateUrl: './app/plasmotrack.component.html',
    styleUrls: ['./app/plasmotrack.component.css'],
    directives: [ROUTER_DIRECTIVES, SampleListComponent],
    providers: [
        ROUTER_PROVIDERS,
        
    ]
})
@RouteConfig([
    {
        path: '/plasmomapper/...',
        name: 'PlasmoMapper',
        component: PlasmoMapperComponent,
        useAsDefault: true
    },
    
])
export class PlasmoTrackComponent {
    title = "PlasmoTrack";
    
}