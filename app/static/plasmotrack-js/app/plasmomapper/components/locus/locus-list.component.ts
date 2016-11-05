import { Component, OnInit } from '@angular/core';
import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';

import { CapitalizePipe } from '../../pipes/capitalize.pipe';

import { Locus } from '../../services/locus/locus.model';
import { LocusService } from '../../services/locus/locus.service';
import { LocusDetailComponent } from './locus-detail.component';

@Component({
    selector: 'pm-locus-list',
    template: `
    <br>
    <div class="row main-container">
        
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">Loci</h3>
                </div>
                <div class="panel-body">
                    <div *ngIf="loadingLoci">
                        <pm-progress-bar [label]="'Loci'"></pm-progress-bar>
                    </div>
                    <div *ngIf="!loadingLoci" class="table-responsive list-panel">
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
                                <tr *ngFor="let locus of loci">
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
                </div>
            </div>
        </div>
        
        <div class="col-sm-6">
        
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">Load From CSV</h3>
                </div>
                <div class="panel-body">
                    <form>
                        <div class="form-group">
                            <input type="file" (change)="fileChangeEvent($event)" placeholder="Upload file..." multiple />
                        </div>
                        <button class="btn btn-primary" type="button" (click)="uploadCSV()">Upload</button>
                    </form>
                </div>
            </div>
            
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
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class LocusListComponent implements OnInit{
    private loci: Locus[];
    private constructorErrors: string[] = []
    private newLocusError: string;
    private locusListError: string;
    private newLocus: Locus;

    private locusCSV: File;
    
    private reversed = false;
    private sortingParam = 'label';
    
    private isSubmitting: boolean;
    
    private loadingLoci = false;
    
    
    constructor(
        private _locusService: LocusService
    ) {
        this.newLocus = new Locus();
    }
    
    
    getLoci() {
        this.loadingLoci = true;
        this._locusService.getLoci().subscribe(
            loci => {
                this.loci = loci;
                this.sortLoci();
            },
            err => this.constructorErrors.push(err),
            () => {
                this.loadingLoci = false;
            }
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
                toastr.error(err);
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
                toastr.error(err);
            },
            () => this.isSubmitting = false
        )
    }
    
    fileChangeEvent(fileInput: any){
        console.log(fileInput);
        this.locusCSV = <File> fileInput.target.files[0];
    }

    uploadCSV() {
        this._locusService.postLocusCSV(this.locusCSV)
            .subscribe(loci => {
                this.getLoci();
            },
            err => {
                toastr.error(err);
            })
    }
    
    ngOnInit() {
        this.getLoci();
    }
}