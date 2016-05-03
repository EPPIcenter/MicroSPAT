import { Component, OnInit } from 'angular2/core';
import { SectionHeaderComponent } from '../layout/section-header.component';

import { CapitalizePipe } from '../../pipes/capitalize.pipe';

import { Locus } from '../../services/locus/locus.model';
import { LocusService } from '../../services/locus/locus.service';
import { LocusDetailComponent } from './locus-detail.component';

@Component({
    selector: 'pm-locus-list',
    template: `
    <pm-section-header [header]="'Loci'"></pm-section-header>
    <div class="row main-container">
        <div class="table-responsive list-panel col-sm-4">
            <span class="label label-danger">{{locusListError}}</span>
            <table class="table table-striped table-hover table-condensed">
                <thead>
                    <tr>
                        <th (click)="sortingParam='label'; reversed=!reversed; sortLoci()">Label</th>
                        <th (click)="sortingParam='min_base_length'; reversed=!reversed; sortLoci()">Min. Base Length</th>
                        <th (click)="sortingParam='max_base_length'; reversed=!reversed; sortLoci()">Max. Base Length</th>
                        <th (click)="sortingParam='nucleotide_repeat_length'; reversed=!reversed; sortLoci()">Nucleotide Repeat Length</th>
                        <th (click)="sortingParam='color'; reversed=!reversed; sortLoci()">Color</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr *ngFor="#locus of loci">
                        <td>{{locus.label}}</td>
                        <td>{{locus.min_base_length}}</td>
                        <td>{{locus.max_base_length}}</td>
                        <td>{{locus.nucleotide_repeat_length}}</td>
                        <td>{{locus.color | capitalize}}</td>
                        <td><a><span (click)="removeLocus(locus.id)" class="glyphicon glyphicon-remove-circle"></span></a></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">New Locus</h3>
                </div>
                <div class="panel-body">
                    <form (ngSubmit)="submitNewLocus()">
                        <div class="form-group">
                            <label>Label</label>
                            <input type="text" class="form-control" required [(ngModel)]="newLocus.label">
                        </div>
                        <div class="form-group">
                            <label>Min. Base Length</label>
                            <input type="number" class="form-control" min="0" required [(ngModel)]="newLocus.min_base_length">
                        </div>
                        <div class="form-group">
                            <label>Max. Base Length</label>
                            <input type="number" class="form-control" min="0" required [(ngModel)]="newLocus.max_base_length">
                        </div>
                        <div class="form-group">
                            <label>Nucleotide Repeat Length</label>
                            <input type="number" class="form-control" min="0" required [(ngModel)]="newLocus.nucleotide_repeat_length">
                            
                        </div>
                        <div class="form-group">
                            <label>Color</label>
                            <select [(ngModel)]="newLocus.color" required class="form-control">
                                <option value="red">Red</option>
                                <option value="green">Green</option>
                                <option value="blue">Blue</option>
                                <option value="yellow">Yellow</option>
                                <option value="orange">Orange</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-default" [ngClass]="{disabled: isSubmitting}">Save</button>
                    </form>
                    <span class="label label-danger">{{newLocusError}}</span>
                </div>
            </div>
        </div>
    </div>
    `,
    pipes: [CapitalizePipe],
    directives: [SectionHeaderComponent]
})
export class LocusListComponent implements OnInit{
    private loci: Locus[];
    private constructorErrors: string[] = []
    private newLocusError: string;
    private locusListError: string;
    private newLocus: Locus;
    
    private reversed = false;
    private sortingParam = 'label';
    
    private isSubmitting: boolean;
    
    
    
    constructor(
        private _locusService: LocusService
    ) {
        this.newLocus = new Locus();
    }
    
    
    getLoci() {
        this._locusService.getLoci().subscribe(
            loci => {
                this.loci = loci;
                this.sortLoci();
            },
            err => this.constructorErrors.push(err)
        )
    }
    
    sortLoci() {
        this.loci.sort((a, b) => {
            if(a[this.sortingParam] > b[this.sortingParam]) {
                return 1
            } else if (a[this.sortingParam] < b[this.sortingParam]) {
                return -1
            } else {
                return 0
            }
        })
        if(this.reversed) {
            this.loci.reverse();
        }
    }
    
    removeLocus(id: number) {
        this.locusListError = null;
        this._locusService.deleteLocus(id).subscribe(
        () => this.getLoci(),
        err => {
            this.locusListError = err;
        })
    }
    
    submitNewLocus() {
        this.isSubmitting = true;
        this.newLocusError = null;
        this._locusService.createLocus(this.newLocus).subscribe(
            () => {
                this.getLoci();
                this.newLocus = new Locus();
            },
            (err) => {
                this.newLocusError = err;
            }
        )
        this.isSubmitting = false;
    }
    
    
    
    ngOnInit() {
        this.getLoci();
    }
}