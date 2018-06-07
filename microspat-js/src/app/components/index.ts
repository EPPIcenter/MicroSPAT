import { NgModule } from '@angular/core/';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

import { MspatMaterialModule } from './material.module';
import { SideNavComponent } from './layout/sidenav';
import { PlatesListComponent } from './plates/plate-list';
import { PlateDetailsComponent } from './plates/plate-details';
import { PlateUploaderComponent } from './plates/plate-uploader';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import { FileInputComponent } from './file-input';
import { PlatePlotComponent } from './plates/plate-plot';
import { LadderEditorComponent } from './plates/ladder-editor';
import { TraceDisplayComponent } from './plates/trace-display';
import { TaskDisplayComponent } from './task-progress';


export const COMPONENTS = [
  SideNavComponent,
  PlatesListComponent,
  PlateDetailsComponent,
  PlateUploaderComponent,
  PlatePlotComponent,
  LadderEditorComponent,
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
    RouterModule
  ],
  declarations: COMPONENTS,
  exports: COMPONENTS
})

export class ComponentModule {};
