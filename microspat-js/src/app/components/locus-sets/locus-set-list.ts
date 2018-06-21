import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { LocusSet } from 'app/models/locus/locus-set';

@Component({
  selector: 'mspat-locus-set-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card *ngIf="locusSetsLoading">
      <mat-card-content>
        <div>
          <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
        </div>
      </mat-card-content>
    </mat-card>
    <ngx-datatable *ngIf="!locusSetsLoading" class="material fullscreen" id="locus-set-list"
      [rows]="locusSets"
      [columns]="columns"
      [messages]="messages"
      columnMode="force"
      [headerHeight]="35"
      [footerHeight]="0"
      [rowHeight]="30"
      [scrollbarV]="true"
      [selectionType]="'single'"
      [selected]="[selectedLocusSet]"
      [trackByProp]="'id'"
      (select)='onSelect($event)'>
    </ngx-datatable>
  `,
  styles: [`
    mat-spinner {
      margin: 0, auto;
    }

    ngx-datatable {
      height: 95vh;
      user-select: none;
      cursor: default;
    }
  `]

})
export class LocusSetListComponent {
  @Input() locusSets: LocusSet[] = [];
  @Input() selectedLocusSet: LocusSet = null;
  @Input() locusSetsLoading: boolean;
  @Output() selectLocusSet = new EventEmitter();

  private spinnerDiameter = 250;

  public columns = [
    {
      prop: 'label',
      name: 'Label'
    }
  ]

  public messages = {
    emptyMessage: 'No Locus Sets Loaded'
  }

  constructor() {}

  onSelect({ selected }) {
    if (selected[0]) {
      this.selectLocusSet.emit(selected[0].id);
    }
  }
}
