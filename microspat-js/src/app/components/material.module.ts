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
         MatInputModule} from '@angular/material';
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
    MatInputModule
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
    MatInputModule
  ],
})
export class MspatMaterialModule { }
