import { Component, OnInit } from '@angular/core';
import { SectionHeaderComponent } from '../layout/section-header.component';

import { CapitalizePipe } from '../../pipes/capitalize.pipe';

import { Locus } from '../../services/locus/locus.model';
import { LocusSet } from '../../services/locus-set/locus-set.model';

import { LocusService } from '../../services/locus/locus.service';
import { LocusSetService } from '../../services/locus-set/locus-set.service';

@Component({
    selector: 'pm-locus-set-list',
    template: `
    <pm-section-header [header]="'Locus Sets'"></pm-section-header>
    <div class="row main-container">
        <div class="table-responsive list-panel col-sm-2">
            <span class="label label-danger">{{locusSetListError}}</span>
            <table class="table table-striped table-hover table-condensed">
                <thead>
                    <tr>
                        <th>Label</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr *ngFor="#locusSet of locusSets">
                        <td>{{locusSet.label}}</td>
                        <td><a><span (click)="removeLocusSet(locusSet.id)" class="glyphicon glyphicon-remove-circle"></span></a></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="col-sm-5">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">New Locus Set</h3>
                </div>
                <div class="panel-body list-panel">
                    <form (ngSubmit)="createLocusSet()">
                        <div class="form-group">
                            <label>Label</label>
                            <input type="text" class="form-control" required [(ngModel)]="newLocusSet.label">
                        </div>
                        <div>
                            <table class="table table-striped table-hover table-condensed">
                                <thead>
                                    <tr>
                                        <th (click)="sortingParam='label'; reversed=!reversed; sortLoci()">Label</th>
                                        <th (click)="sortingParam='min_base_length'; reversed=!reversed; sortLoci()">Min. Base Length</th>
                                        <th (click)="sortingParam='max_base_length'; reversed=!reversed; sortLoci()">Max. Base Length</th>
                                        <th (click)="sortingParam='nucleotide_repeat_length'; reversed=!reversed; sortLoci()">Nucleotide Repeat Length</th>
                                        <th (click)="sortingParam='color'; reversed=!reversed; sortLoci()">Color</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="#locus of loci" [ngClass]="{success: selectedLocusIds[locus.id]}" (click)="selectedLocusIds[locus.id] = !selectedLocusIds[locus.id]">
                                        <td>{{locus.label}}</td>
                                        <td>{{locus.min_base_length}}</td>
                                        <td>{{locus.max_base_length}}</td>
                                        <td>{{locus.nucleotide_repeat_length}}</td>
                                        <td>{{locus.color | capitalize}}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <button type="submit" class="btn btn-default" [ngClass]="{disabled: isSubmitting}">Save</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    `,
    pipes: [CapitalizePipe],
    directives: [SectionHeaderComponent]
})
export class LocusSetListComponent implements OnInit{
    private isSubmitting = false;
    private locusSets: LocusSet[];
    private loci: Locus[];
    private constructorErrors: string[] = [];
    private newLocusSetError: string;
    private locusSetListError: string;
    
    private sortingParam = 'label';
    private reversed = false;
    
    private selectedLocusIds: Object;
    private newLocusSet: LocusSet;
    
    
    constructor(
        private _locusSetService: LocusSetService,
        private _locusService: LocusService
    ){
        this.newLocusSet = new LocusSet();
    }
    
    getLocusSets() {
        this._locusSetService.getLocusSets().subscribe(
            locusSets => {
                this.locusSets = locusSets;
            }
        )
    }
    
    getLoci() {
        this.selectedLocusIds = new Map<number, boolean>();
        this._locusService.getLoci().subscribe(
            loci => {
                this.loci = loci;
                loci.forEach((locus) => {
                    this.selectedLocusIds[locus.id] = false;
                })
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
    
    removeLocusSet(id: number) {
        this.locusSetListError = null;
        this._locusSetService.deleteLocusSet(id).subscribe(
            () => {
                this.getLocusSets();
            },
            (err) => this.locusSetListError = err
        )
    }
    
    createLocusSet() {
        this.isSubmitting = true;
        this.newLocusSetError = null;
        let locusIds = []
        console.log(this.selectedLocusIds);
        
        for(let id in this.selectedLocusIds) {
            if(this.selectedLocusIds[id]){
                locusIds.push(id);
            }
        }
        
        console.log(locusIds);
        
        this._locusSetService.createLocusSet(this.newLocusSet, locusIds).subscribe(
            () => {
                this.newLocusSet = new LocusSet();
                this.getLocusSets();
                this.getLoci();
            },
            (err) => {
                this.newLocusSetError = err;
            }
        );
        this.isSubmitting = false;
    }
    
    ngOnInit(){
        this.getLocusSets();
        this.getLoci();
    }
}