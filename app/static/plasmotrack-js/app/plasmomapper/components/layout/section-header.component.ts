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