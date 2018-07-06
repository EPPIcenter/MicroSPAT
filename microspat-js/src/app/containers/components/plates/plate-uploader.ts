import { Component, Input, EventEmitter, Output, ChangeDetectionStrategy } from '@angular/core';
import { Ladder } from 'app/models/ce/ladder';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-plate-uploader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <mat-card class="plate-uploader">
    <mat-card-header>
      <mat-card-title>
        <h4>Upload Plates</h4>
      </mat-card-title>
    </mat-card-header>
    <mat-card-content>
      <mspat-file-input [multiple]="true" [placeholder]="'Select Plates'" (fileChangeEvent)="fileChangeEvent($event)"></mspat-file-input>
      <mat-form-field>
        <mat-select (selectionChange)="ladderChange($event)" [(value)]="selected" placeholder="Select Ladder">
          <mat-option *ngFor="let ladder of ladders" [value]="ladder.id">{{ladder.label}}</mat-option>
        </mat-select>
      </mat-form-field>
    </mat-card-content>
    <mat-card-actions>
      <button mat-raised-button color="primary"
              [disabled]="taskActive"
              (click)="uploadPlateClicked()">UPLOAD</button>
      <span *ngIf="warning" class="mspat-warning">{{warning}}</span>
    </mat-card-actions>
    <mat-card-footer>
      <mspat-task-progress-display *ngIf="activeUploadPlateTask" [task]="activeUploadPlateTask"></mspat-task-progress-display>
      <mspat-task-progress-display *ngIf="failedUploadPlateTask"[task]="failedUploadPlateTask"></mspat-task-progress-display>
    </mat-card-footer>
  </mat-card>
  `,
  styles: [`
    .plate-uploader {
      margin: 0 0 10px 0;
    }

  `]
})
export class PlateUploaderComponent {
  @Input() ladders: Ladder[] = [];
  @Input() activeUploadPlatesTasks: Task[];
  @Input() failedUploadPlatesTasks: Task[];
  @Input() activeTasks: Task[];
  @Output() uploadPlate = new EventEmitter();

  private selectedFiles: FileList;
  private selectedLadder: string;
  private warning;

  ladderChange(e) {
    if (e) {
      this.selectedLadder = e.value;
    } else {
      this.selectedLadder = null;
    }
  }

  fileChangeEvent(f) {
    if (f) {
      this.selectedFiles = f.target.files;
    } else {
      this.selectedFiles = null;
    }
  }

  uploadPlateClicked() {
    if (!this.selectedFiles || this.selectedFiles.length === 0) {
      this.warning = 'Please Select Plates';
    } else if (!this.selectedLadder) {
      this.warning = 'Please Select a Ladder';
    } else {
      this.warning = null;
      this.uploadPlate.emit({
        plates: this.selectedFiles,
        ladder: this.selectedLadder
      });
    }
  }

  get taskActive() {
    return this.activeTasks.length > 0;
  }

  get activeUploadPlateTask() {
    return this.activeUploadPlatesTasks.length > 0 ? this.activeUploadPlatesTasks[0] : false;
  }

  get failedUploadPlateTask() {
    return this.failedUploadPlatesTasks.length > 0 ? this.failedUploadPlatesTasks[0] : false
  }

}
