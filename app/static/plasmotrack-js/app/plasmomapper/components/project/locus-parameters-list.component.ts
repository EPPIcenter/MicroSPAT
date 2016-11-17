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