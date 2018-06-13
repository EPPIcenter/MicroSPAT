import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';

import { Ladder } from 'app/models/ce/ladder';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromLadder from 'app/reducers/ladders/ladders'

import { LadderService } from 'app/services/ce/ladder';

import * as ladders from 'app/actions/ladders';


@Component({
  selector: 'mspat-ladders',
  template: `
  <div class="container-fluid">
    <div class="row">
      <div class="col-sm-5">
        <mspat-ladders-list
          [ladders]="ladders$ | async"
          [selectedLadder]="activeLadder$ | async"
          [laddersLoading]="laddersLoading$ | async"
          [laddersLoaded]="laddersLoaded$ | async"
          (selectLadder)="selectLadder($event)">
        </mspat-ladders-list>
      </div>
      <div class="col-sm-7">
        <mspat-ladder-editor
          [ladder]="activeLadder$ | async"
          (cancel)="cancelEdit()">
        </mspat-ladder-editor>
      </div>
    </div>
  </div>
  `
})
export class LaddersComponent {
  ladders$: Observable<Ladder[]>;
  laddersLoading$: Observable<boolean>;
  laddersLoaded$: Observable<boolean>;
  activeLadder$: Observable<Ladder>;

  constructor(
    private store: Store<fromRoot.AppState>,
    private ladderService: LadderService
  ) {
    this.store.dispatch(new ladders.LoadLaddersAction());
    this.ladders$ = this.store.select(fromDB.selectLadderList);
    this.laddersLoading$ = this.store.select(fromLadder.selectLoadingLadders);
    this.laddersLoaded$ = this.store.select(fromLadder.selectLaddersLoaded);
    this.activeLadder$ = this.store.select(fromLadder.selectActiveLadder);
  }


  selectLadder(e: string | number) {
    this.store.dispatch(new ladders.SelectLadderAction(+e))
  }

  cancelEdit() {
    this.store.dispatch(new ladders.UnselectLadderAction());
  }
}
