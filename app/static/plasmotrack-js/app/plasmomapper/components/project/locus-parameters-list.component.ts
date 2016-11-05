import { Component, Output, EventEmitter } from '@angular/core';
import { LocusParameters } from '../../services/project/locus-parameters/locus-parameters.model';
import { LocusPipe } from '../../pipes/locus.pipe';

@Component({
    selector: 'pm-locus-parameter-list',
    inputs: ['locusParameters'],
    template: `
    <div class="panel panel-default">
        <div class="panel-heading">
            <h3 class="panel-title">Loci</h3>
        </div>
        <div class="panel-body">
            <div class="table-responsive">
                <table class="table table-hover table-condensed">
                    <tbody>
                        <tr (click)="onLocusClick(-1)">
                            <td>All Loci</td>
                        </tr>
                        <tr *ngFor="let locusParameter of locusParameters" (click)="onLocusClick(locusParameter.locus_id)" [ngClass]="{warning: locusParameter.isDirty || locusParameter.scanning_parameters_stale || locusParameter.filter_parameters_stale || locusParameter.artifact_estimator_parameters_stale || locusParameter.genotyping_parameters_stale || locusParameter.bin_estimator_parameters_stale}">
                            <td>{{locusParameter.locus_id | locus | async}}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
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