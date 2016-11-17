// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

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