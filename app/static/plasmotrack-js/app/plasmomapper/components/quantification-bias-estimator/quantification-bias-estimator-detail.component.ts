import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';


@Component({
    selector: 'pm-quantification-bias-estimator-detail',
    template: `
    `,
    styleUrls: ['app/plasmomapper/styles/forms.css'],
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class QuantificationBiasEstimatorDetailComponent implements OnInit {
    private navItems;
    private navHeader: string;
    private deletingProject = false;
    private savingProject = false;

    ngOnInit() {

    }
}