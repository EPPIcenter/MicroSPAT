import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { Task } from '../../models/task';

@Component({
  selector: 'mspat-task-progress-display',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div>
    <h6>{{_message}}</h6>
    <mat-progress-bar
      [color]="color"
      [mode]="mode"
      [value]="value">
    </mat-progress-bar>
  </div>
  `
})
export class TaskDisplayComponent {
  @Input() task: Task;
  @Input() message: string;

  get mode() {
    if (this.task.status === 'in_progress') {
      return this.task.payload.style;
    } else if (this.task.status === 'start') {
      return 'buffer';
    } else if (this.task.status === 'failure') {
      return 'buffer';
    } else {
      return 'indeterminate'
    }
  }

  get value() {
    if (this.task.status === 'in_progress') {
      return (this.task.payload.current_state / this.task.payload.total) * 100;
    } else {
      return 0;
    }
  }

  get _message() {
    if (!this.message) {
      if (this.task.status === 'in_progress') {
        return this.task.payload.message;
      } else if (this.task.status === 'start') {
        return 'Starting...'
      } else if (this.task.status === 'failure') {
        return this.task.payload;
      }
    } else {
      return this.message
    }
  }

  get color() {
    return this.task.status === 'failure' ? 'warn' : 'primary'
  }
}
