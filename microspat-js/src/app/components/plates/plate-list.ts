import { Component, Input, EventEmitter, Output, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Plate } from 'app/models/ce/plate';

class DateOnlyPipe extends DatePipe {
  public transform(value): any {
    return super.transform(value, 'MM/dd/y');
  }
}

@Component({
  selector: 'mspat-plates-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <ngx-datatable class="material fullscreen" id="plates-list"
    [rows]="plates"
    [columns]="columns"
    [messages]="messages"
    columnMode="force"
    [headerHeight]="35"
    [footerHeight]="0"
    [rowHeight]="30"
    [selectionType]="'single'"
    [scrollbarV]="true"
    [rowIdentity]="rowIdentity"
    (select)='onSelect($event)'>
  </ngx-datatable>
  `,
  styles: [`
    ngx-datatable {
      height: 70vh;
      user-select: none;
      cursor: default;
    }
  `]
})
export class PlatesListComponent {
  @Input() plates: Plate[] = [];
  @Output() selectPlate = new EventEmitter();

  public columns = [
    {
      prop: 'label',
      name: 'Label',
    },
    // {
    //   prop: 'ce_machine',
    //   name: 'CE Machine',
    //   width: 105
    // },
    {
      prop: 'date_processed',
      name: 'Date Processed',
      width: 75,
      pipe: new DateOnlyPipe('en-US')
    },
    {
      prop: 'date_run',
      name: 'Date Run',
      width: 60,
      pipe: new DateOnlyPipe('en-US')
    }
  ];

  public messages = {
    emptyMessage: "No Plates Loaded"
  };

  constructor() {}

  onSelect({ selected }) {
    if (selected[0]) {
      this.selectPlate.emit(selected[0].id);
    }
  }

  rowIdentity(p: Plate) {
    return p.id;
  }

}
