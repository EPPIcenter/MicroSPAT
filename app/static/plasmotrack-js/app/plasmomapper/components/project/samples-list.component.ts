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

import { Component, OnChanges, SimpleChange } from '@angular/core';
import { SampleAnnotation } from '../../services/sample-based-project/sample-annotation/sample-annotation.model';

@Component({
    selector: 'pm-sample-annotation-list',
    inputs: ['sample_annotations', 'clickBinding'],
    template:`    
    <div class="table-responsive">
        <table class="table table-striped table-hover">
            <thead>
                <tr>
                    <th>Barcode</th>
                    <th>Designation</th>
                    <th>MOI</th>
                    <th>Last Updated</th>
                <tr>
            </thead>
            <tbody>
                <tr *ngFor="let sample_annotation of sample_annotations" (click)="clickBinding(sample_annotation)">
                    <td>{{sample_annotation.sample.barcode}}</td>
                    <td>{{sample_annotation.sample.designation}}</td>
                    <td>{{sample_annotation.moi}}</td>
                    <td>{{sample_annotation.last_updated | date: "fullDate"}}</td>
                </tr>
            </tbody>
        </table>
    </div>
    `
})
export class SampleListComponent {
    public sample_annotations: SampleAnnotation[];
    public clickBinding: (SampleAnnotation);
    
    constructor(){}
}