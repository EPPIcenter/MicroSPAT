import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { Locus } from '../models/locus/locus';
import { Task } from '../models/task';

import * as fromRoot from '../reducers';
import * as fromDB from '../reducers/db';
import * as fromLocus from '../reducers/loci/loci';
import * as fromTasks from '../reducers/tasks';

import * as loci from '../actions/loci';

@Component({
  selector: 'mspat-loci',
  template: `
  <div class="container-fluid">
    <div class="row">
      <div class="col-sm-5">
        <mspat-locus-list
        [loci]="loci$ | async"
        [lociLoading]="lociLoading$ | async"
        [selectedLocus]="selectedLocus$ | async"
        (selectLocus)="selectLocus($event)">
        </mspat-locus-list>
      </div>
      <div class="col-sm-7">
        <mspat-locus-editor
          [locus]="selectedLocus$ | async"
          [activeTasks]="activeTasks$ | async"
          [activeLocusTasks]="activeLocusTasks$ | async"
          [failedLocusTasks]="failedLocusTasks$ | async"
          (cancel)="cancelEdit()"
          (submit)="submitLocus($event)"
          (delete)="deleteLocus($event)">
        </mspat-locus-editor>
      </div>
    </div>
  </div>
  `,
})
export class LociComponent {
  loci$: Observable<Locus[]>;
  selectedLocus$: Observable<Locus>;
  lociLoading$: Observable<boolean>;

  activeTasks$: Observable<Task[]>;
  activeLocusTasks$: Observable<Task[]>;
  failedLocusTasks$: Observable<Task[]>;

  constructor(
    private store: Store<fromRoot.AppState>,
  ) {
    this.loci$ = this.store.select(fromDB.selectLocusList);
    this.selectedLocus$ = this.store.select(fromLocus.selectActiveLocus);
    this.lociLoading$ = this.store.select(fromLocus.selectLoadingLoci);
    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.activeLocusTasks$ = this.store.select(fromTasks.selectActiveTasks('locus'));
    this.failedLocusTasks$ = this.store.select(fromTasks.selectFailedTasks('locus'));
  }

  selectLocus(l: number | string) {
    this.store.dispatch(new loci.SelectLocusAction(l));
  }

  submitLocus(l: Locus) {
    this.store.dispatch(new loci.SubmitLocusAction(l));
  }

  deleteLocus(l: number) {
    this.store.dispatch(new loci.DeleteLocusAction(l));
  }

  cancelEdit() {
    this.store.dispatch(new loci.UnselectLocusAction());
  }

}
