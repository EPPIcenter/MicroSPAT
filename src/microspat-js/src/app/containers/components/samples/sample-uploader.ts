import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Task } from '../../../models/task';

@Component({
  selector: 'mspat-sample-uploader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <mat-card class="sample-uploader">
    <mat-card-header>
      <mat-card-title>
        <h4>Upload Samples</h4>
      </mat-card-title>
    </mat-card-header>
    <mat-card-content>
      <mspat-file-input [multiple]='false' [placeholder]="'Select Samples'" (fileChangeEvent)="fileChangeEvent($event)"></mspat-file-input>
    </mat-card-content>
    <mat-card-actions>
      <button mat-raised-button color="primary"
              [disabled]="taskActive"
              (click)="uploadSamplesClicked()">UPLOAD</button>
      <span *ngIf="warning" class="mspat-warning">{{warning}}</span>
    </mat-card-actions>
    <mat-card-footer>
      <mspat-task-progress-display *ngIf="activeUploadSamplesTask" [task]="activeUploadSamplesTask"></mspat-task-progress-display>
      <mspat-task-progress-display *ngIf="failedUploadSamplesTask"[task]="failedUploadSamplesTask"></mspat-task-progress-display>
    </mat-card-footer>
  </mat-card>
  `,
  styles: [`
    .sample-uploader {
      margin: 0 0 10px 0;
      height: 100%
    }
  `],
})
export class SampleUploaderComponent {
  @Input() activeUploadSamplesTasks: Task[];
  @Input() failedUploadSamplesTasks: Task[];
  @Input() activeTasks: Task[];
  @Output() uploadSamples: EventEmitter<FileList> = new EventEmitter()

  public selectedFiles: FileList;
  public warning: string;

  fileChangeEvent(f: { target: { files: FileList; }; }) {
    if (f) {
      this.selectedFiles = f.target.files;
    } else {
      this.selectedFiles = null;
    }
  }

  uploadSamplesClicked() {
    if (!this.selectedFiles || this.selectedFiles.length === 0) {
      this.warning = 'Please Select Samples File';
    } else {
      this.warning = null;
      this.uploadSamples.emit(this.selectedFiles);
    }
  }

  get taskActive() {
    return this.activeTasks.length > 0;
  }

  get activeUploadSamplesTask() {
    return this.activeUploadSamplesTasks.length > 0 ? this.activeUploadSamplesTasks[0] : false;
  }

  get failedUploadSamplesTask() {
    return this.failedUploadSamplesTasks.length > 0 ? this.failedUploadSamplesTasks[0] : false;
  }
}
