import { Component, Input, EventEmitter, Output, ChangeDetectionStrategy } from '@angular/core';
import { Well } from 'app/models/ce/well';

@Component({
  selector: 'mspat-well-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  `
})
export class WellDetailsComponent {
  @Input() wells: Well[];
}
