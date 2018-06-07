import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-task-progress-display',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div>
    <h6>{{_message}}</h6>
    <mat-progress-bar
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
      return 'buffer'
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
      }
    } else {
      return this.message
    }
  }
}
