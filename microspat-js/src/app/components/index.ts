import { NgModule } from '@angular/core/';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';

import { MspatMaterialModule } from './material.module';

import { SideNavComponent } from './layout/sidenav';

import { FileInputComponent } from './file-input';

import { PlatesListComponent } from './plates/plate-list';
import { PlateDetailsComponent } from './plates/plate-details';
import { PlateUploaderComponent } from './plates/plate-uploader';
import { PlatePlotComponent } from './plates/plate-plot';
import { WellLadderEditorComponent } from './plates/ladder-editor';
import { TraceDisplayComponent } from './plates/trace-display';

import { LocusListComponent } from './loci/locus-list';
import { LocusEditorComponent } from './loci/locus-editor';

import { LocusSetListComponent } from './locus-sets/locus-set-list';
import { LocusSetEditorComponent } from './locus-sets/locus-set-editor';
import { LocusSetDetailsComponent } from './locus-sets/locus-set-details';

import { LadderEditorComponent } from './ladders/ladders-editor';
import { LadderListComponent } from './ladders/ladders-list';

import { TaskDisplayComponent } from './task-progress';



export const COMPONENTS = [
  SideNavComponent,
  PlatesListComponent,
  PlateDetailsComponent,
  PlateUploaderComponent,
  PlatePlotComponent,
  WellLadderEditorComponent,
  LadderEditorComponent,
  LadderListComponent,
  LocusListComponent,
  LocusEditorComponent,
  LocusSetListComponent,
  LocusSetEditorComponent,
  LocusSetDetailsComponent,
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
    ReactiveFormsModule,
    FormsModule
  ],
  declarations: COMPONENTS,
  exports: COMPONENTS
})

export class ComponentModule {};
