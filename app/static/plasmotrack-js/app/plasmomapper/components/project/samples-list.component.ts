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
                <tr *ngFor="#sample_annotation of sample_annotations" (click)="clickBinding(sample_annotation)">
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
    
    constructor(){
        console.log("Creating SampleListComponent");
    }
}