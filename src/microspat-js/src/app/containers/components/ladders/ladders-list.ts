import { Component, Input, EventEmitter, Output, ChangeDetectionStrategy, Pipe, PipeTransform } from '@angular/core';
import { TitleCasePipe } from '@angular/common'
import { Ladder } from '../../../models/ce/ladder';

@Pipe({name: 'baseSizes'})
export class BaseSizePipe implements PipeTransform {
  transform(value: number[]): string {
    return value.join(',');
  }
}

@Component({
  selector: 'mspat-ladders-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <mat-card *ngIf='!laddersLoaded'>
    <mat-card-content>
      <div>
        <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
      </div>
    </mat-card-content>
  </mat-card>
  <ngx-datatable *ngIf='laddersLoaded' class="material fullscreen" id="ladders-list"
        [rows]="ladders"
        [columns]='columns'
        [messages]='messages'
        columnMode='force'
        [headerHeight]='35'
        [footerHeight]='0'
        [rowHeight]='30'
        [selectionType]="'single'"
        [selected]="[selectedLadder]"
        [scrollbarV]='true'
        [trackByProp]="'id'"
        (select)='onSelect($event)'>
      </ngx-datatable>
  `,
  styles: [`
    mat-spinner {
      margin: 0 auto
    }

    ngx-datatable {
      height: 70vh;
      user-select: none;
      cursor: default;
    }
  `]
})
export class LadderListComponent {
  @Input() ladders: Ladder[] = [];
  @Input() selectedLadder: Ladder = null;
  @Input() laddersLoading: boolean;
  @Input() laddersLoaded: boolean;
  @Output() selectLadder = new EventEmitter();

  public spinnerDiameter = 250;

  public columns = [
    {
      prop: 'label',
      name: 'Ladder',
      width: 30
    },
    {
      prop: 'color',
      name: 'Color',
      pipe: new TitleCasePipe(),
      width: 30
    },
    {
      prop: 'base_sizes',
      name: 'Base Sizes',
      pipe: new BaseSizePipe(),
      width: 150
    },
    {
      prop: 'sq_limit',
      name: 'SQ Limit',
      width: 20
    }
  ]

  public messages = {
    emptyMessage: 'No Ladders Loaded'
  };

  constructor() {}

  onSelect({selected}) {
    if (selected[0]) {
      this.selectLadder.emit(selected[0].id);
    }
  }

  // rowIdentity(l: Ladder) {
  //   return l.id;
  // }

}
