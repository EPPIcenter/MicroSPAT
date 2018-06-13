import { NgModule } from '@angular/core/';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';

import { MspatMaterialModule } from './material.module';
import { SideNavComponent } from './layout/sidenav';
import { PlatesListComponent } from './plates/plate-list';
import { PlateDetailsComponent } from './plates/plate-details';
import { PlateUploaderComponent } from './plates/plate-uploader';

import { FileInputComponent } from './file-input';

import { PlatePlotComponent } from './plates/plate-plot';
import { WellLadderEditorComponent } from './plates/ladder-editor';
import { TraceDisplayComponent } from './plates/trace-display';

import { LadderEditorComponent } from './ladders/ladders-editor';
import { LadderListComponent } from './ladders/ladders-list';

import { TaskDisplayComponent } from './task-progress';
import { ReactiveFormsModule } from '@angular/forms';


export const COMPONENTS = [
  SideNavComponent,
  PlatesListComponent,
  PlateDetailsComponent,
  PlateUploaderComponent,
  PlatePlotComponent,
  WellLadderEditorComponent,
  LadderEditorComponent,
  LadderListComponent,
  TraceDisplayComponent,
  FileInputComponent,
  TaskDisplayComponent
];

@NgModule({
  imports: [
    CommonModule,
    MspatMaterialModule,
    NgxDatatableModule,
    BrowserAnimationsModule,
    RouterModule,
    ReactiveFormsModule
  ],
  declarations: COMPONENTS,
  exports: COMPONENTS
})

export class ComponentModule {};
