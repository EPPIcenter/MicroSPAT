import { Component, Input, EventEmitter, Output, ChangeDetectionStrategy } from '@angular/core';
import { Plate } from 'app/models/ce/plate';
import { Ladder } from 'app/models/ce/ladder';

@Component({
  selector: 'mspat-plate-uploader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <mat-card class="plate-uploader">
    <mat-card-header>
      <mat-card-title>
        Upload Plates
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
      <button mat-raised-button color="primary" (click)="uploadPlateClicked()">Upload</button> <span *ngIf="warning" class="mspat-warning">{{warning}}</span>
    </mat-card-actions>
  </mat-card>
  `,
  styles: [`
    .plate-uploader {
      margin-bottom: 10px;
    }
  `]
})
export class PlateUploaderComponent {
  @Input() ladders: Ladder[] = [];
  @Output() uploadPlate = new EventEmitter();

  private selectedFiles;
  private selectedLadder;
  private warning;

  ladderChange(e) {
    console.log(e);
    if (e) {
      this.selectedLadder = e.value;
    } else {
      this.selectedLadder = null;
    }
    console.log(this.selectedLadder);
  }

  fileChangeEvent(f) {
    if (f) {
      this.selectedFiles = f.target.files;
    } else {
      this.selectedFiles = null;
    }
    console.log(this.selectedFiles);
  }

  uploadPlateClicked() {
    console.log("Upload Plate", this.selectedFiles, this.selectedLadder);
    if (!this.selectedFiles || this.selectedFiles.length === 0) {
      this.warning = "Please Select Plates";
    } else if (!this.selectedLadder) {
      this.warning = "Please Select a Ladder";
    } else {
      this.warning = null;
      this.uploadPlate.emit({
        plates: this.selectedFiles,
        ladder:this.selectedLadder
      });
      console.log("Success");
    }
  }

}
