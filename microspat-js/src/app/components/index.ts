import { NgModule } from '@angular/core/';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatCardModule,
  MatGridListModule,
  MatTabsModule,
  MatProgressSpinnerModule,
  MatSelectModule,
  MatButtonModule,
  MatListModule,
  MatChipsModule,
  MatFormFieldModule,
  MatInputModule } from '@angular/material';
import { SideNavComponent } from 'app/components/sidenav';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PlatesListComponent } from 'app/components/plates/plate-list';
import { PlateDetailsComponent } from 'app/components/plates/plate-details';
import { PlateUploaderComponent } from 'app/components/plates/plate-uploader';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import { FileInputComponent } from 'app/components/file-input';
import { PlatePlotComponent } from 'app/components/plates/plate-plot';
import { LadderEditorComponent } from 'app/components/plates/ladder-editor';
import { TraceDisplayComponent } from 'app/components/plates/trace-display';


export const COMPONENTS = [
  SideNavComponent,
  PlatesListComponent,
  PlateDetailsComponent,
  PlateUploaderComponent,
  PlatePlotComponent,
  LadderEditorComponent,
  TraceDisplayComponent,
  FileInputComponent
];

@NgModule({
  imports: [
    CommonModule,
    MatChipsModule,
    MatCardModule,
    MatGridListModule,
    MatTabsModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    NgxDatatableModule,
    BrowserAnimationsModule,
    RouterModule
  ],
  declarations: COMPONENTS,
  exports: COMPONENTS
})

export class ComponentModule {};
