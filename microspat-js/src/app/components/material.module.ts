import { NgModule } from '@angular/core';
import { MatButtonModule,
         MatCheckboxModule,
         MatMenuModule,
         MatChipsModule,
         MatCardModule,
         MatGridListModule,
         MatTabsModule,
         MatSelectModule,
         MatProgressSpinnerModule,
         MatProgressBarModule,
         MatListModule,
         MatFormFieldModule,
         MatInputModule,
         MatDividerModule } from '@angular/material';

@NgModule({
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatMenuModule,
    MatChipsModule,
    MatCardModule,
    MatGridListModule,
    MatTabsModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule
  ],
  exports: [
    MatButtonModule,
    MatCheckboxModule,
    MatMenuModule,
    MatChipsModule,
    MatCardModule,
    MatGridListModule,
    MatTabsModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule
  ],
})
export class MspatMaterialModule { }
