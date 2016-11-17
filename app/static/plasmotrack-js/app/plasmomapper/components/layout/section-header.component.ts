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

import { Component } from '@angular/core';
import { ROUTER_DIRECTIVES } from '@angular/router-deprecated';

import { Project } from '../../services/project/project.model';

@Component({
    selector: 'pm-section-header',
    inputs: ['header', 'navItems'],
    template: `
    <div class="row">
        <div class="panel panel-default">
            <div class="panel-heading">
                <h3 class="panel-title">{{header}}</h3>
            </div>
            <div *ngIf="navItems" class="panel-body">
                <ul class="nav navbar-nav">
                    <li *ngFor="let nav_item of navItems" (click)="nav_item.click()" [class.router-link-active]="nav_item.active">
                        <a>{{nav_item.label}}</a>
                    </li>
                </ul>
            </div>
        </div>
    </div>
    `,
    directives: [ROUTER_DIRECTIVES]
})
export class SectionHeaderComponent {
    public navItems: Object[];
    public header: string;
}