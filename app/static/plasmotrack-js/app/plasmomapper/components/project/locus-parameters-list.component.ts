import { Component, Output, EventEmitter } from '@angular/core';
import { LocusParameters } from '../../services/project/locus-parameters/locus-parameters.model';
import { LocusPipe } from '../../pipes/locus.pipe';

@Component({
    selector: 'pm-locus-parameter-list',
    inputs: ['locusParameters'],
    template: `
    <div class="btn-group">
        <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown">
            Select Locus <span class="caret"></span>
        </button>
        <ul class="dropdown-menu">
            <li (click)="onLocusClick(-1)">
                <a>All Loci</a>
            </li>
            <li role="separator" class="divider"></li>
            <li *ngFor="let locusParameter of locusParameters" (click)="onLocusClick(locusParameter.locus_id)"  >
                <a>{{locusParameter.locus_id | locus | async}} <span *ngIf="locusParameter.isDirty || locusParameter.scanning_parameters_stale || locusParameter.filter_parameters_stale || locusParameter.artifact_estimator_parameters_stale || locusParameter.genotyping_parameters_stale || locusParameter.bin_estimator_parameters_stale">(Stale)</span></a>
            </li>
        </ul>
    </div>
    `,
    pipes: [LocusPipe]
})
export class LocusParametersListComponent {
    public locusParameters: LocusParameters[];
    
    @Output() locusClicked = new EventEmitter();
    
    onLocusClick(locus_id: number) {
        this.locusClicked.emit(locus_id);
    }
    
    constructor() {
    }

}