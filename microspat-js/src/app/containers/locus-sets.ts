import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromLocusSets from 'app/reducers/locus-sets/locus-sets';
import * as fromTasks from 'app/reducers/tasks';

import * as locusSets from 'app/actions/locus-sets';

import { LocusSet } from 'app/models/locus/locus-set';
import { Locus } from 'app/models/locus/locus';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-locus-sets',
  template: `
  <div class="container-fluid">
    <div class="row">
      <div class="col-sm-3">
        <mspat-locus-set-list
        [locusSets]="locusSets$ | async"
        [locusSetsLoading]="locusSetsLoading$ | async"
        [selectedLocusSet]="selectedLocusSet$ | async"
        (selectLocusSet)="selectLocusSet($event)">
        </mspat-locus-set-list>
      </div>
      <div class="col-sm-9" *ngIf="(selectedLocusSet$ | async); else editingLocusSet">
        <mspat-locus-set-details
          [locusDict]="locusDict$ | async"
          [locusSet]="selectedLocusSet$ | async"
          [activeTasks]="activeTasks$ | async"
          [activeLocusSetTasks]="activeLocusSetTasks$ | async"
          [failedLocusSetTasks]="failedLocusSetTasks$ | async"
          (cancel)="unselectLocusSet()"
          (delete)='deleteLocusSet($event)'>
        </mspat-locus-set-details>
      </div>
      <ng-template #editingLocusSet>
      <div class="col-sm-9">
        <mspat-locus-set-editor
          [loci]="loci$ | async"
          [activeTasks]="activeTasks$ | async"
          [activeLocusSetTasks]="activeLocusSetTasks$ | async"
          [failedLocusSetTasks]="failedLocusSetTasks$ | async"
          (submit)="saveLocusSet($event)"
          >
        </mspat-locus-set-editor>
      </div>
      </ng-template>
    </div>
  </div>
  `
})
export class LocusSetsComponent {
  locusSets$: Observable<LocusSet[]>;
  loci$: Observable<Locus[]>;
  locusDict$: Observable<{[id: string]: Locus}>;
  selectedLocusSet$: Observable<LocusSet>;
  locusSetsLoading$: Observable<boolean>;
  activeTasks$: Observable<Task[]>;
  activeLocusSetTasks$: Observable<Task[]>;
  failedLocusSetTasks$: Observable<Task[]>;

  constructor(
    private store: Store<fromRoot.AppState>,
  ) {
    this.locusSets$ = this.store.select(fromDB.selectLocusSetList);
    this.loci$ = this.store.select(fromDB.selectLocusList);
    this.locusDict$ = this.store.select(fromDB.selectLocusEntities);
    this.selectedLocusSet$ = this.store.select(fromLocusSets.selectActiveLocusSet);
    this.locusSetsLoading$ = this.store.select(fromLocusSets.selectLoadingLocusSets);
    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.activeLocusSetTasks$ = this.store.select(fromTasks.selectActiveTasks('locus_set'));
    this.failedLocusSetTasks$ = this.store.select(fromTasks.selectFailedTasks('locus_set'));
  }

  selectLocusSet(l: number | string) {
    this.store.dispatch(new locusSets.SelectLocusSetAction(l));
  }

  unselectLocusSet() {
    this.store.dispatch(new locusSets.UnselectLocusSetAction());
  }

  saveLocusSet(ls: {label: string, loci: number[]}) {
    this.store.dispatch(new locusSets.SubmitLocusSetAction(ls));
  }

  deleteLocusSet(id: number) {
    this.store.dispatch(new locusSets.DeleteLocusSetAction(id));
  }
}
