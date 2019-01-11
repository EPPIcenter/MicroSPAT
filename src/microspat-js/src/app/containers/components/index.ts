import { SampleGenotypingListComponent } from './genotyping-project/genotyping-sample-list';
import { GenotypeViewerTabComponent } from './genotyping-project/genotypes-viewer-tab';
import { GenotypeTraceDisplayComponent } from './genotyping-project/genotype-trace-display';
import { GenotypeListComponent } from './genotyping-project/genotype-list';
import { GenotypeEditorTabComponent } from './genotyping-project/genotypes-editor-tab';
import { GenotypingProjectSamplesTabComponent } from './genotyping-project/genotyping-project-samples-tab';
import { NgModule } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import { TruncateStringPipe } from 'app/pipes/truncate-pipe';

import { MspatMaterialModule } from './material.module';

import { SideNavComponent } from './layout/sidenav';

import { FileInputComponent } from './file-input';

import { PlatesListComponent } from './plates/plate-list';
import { PlateDetailsComponent } from './plates/plate-details';
import { PlateUploaderComponent } from './plates/plate-uploader';
import { PlatePlotComponent } from './plates/plate-plot';
import { WellLadderEditorComponent } from './plates/ladder-editor';
import { TraceDisplayComponent } from './plots/trace-display';

import { LocusListComponent } from './loci/locus-list';
import { LocusEditorComponent } from './loci/locus-editor';

import { LocusSetListComponent } from './locus-sets/locus-set-list';
import { LocusSetEditorComponent } from './locus-sets/locus-set-editor';
import { LocusSetDetailsComponent } from './locus-sets/locus-set-details';

import { LadderEditorComponent } from './ladders/ladders-editor';
import { LadderListComponent, BaseSizePipe } from './ladders/ladders-list';

import { SampleListComponent } from './samples/samples-list';
import { SampleUploaderComponent } from './samples/sample-uploader';
import { SampleDetailsComponent } from './samples/sample-details';

import { ControlListComponent } from './controls/control-list';
import { ControlDetailsComponent } from './controls/control-details';

import { TaskDisplayComponent } from './task-progress';

import { BinEstimatorListComponent } from './bin-estimators/bin-estimator-list';
import { BinEstimatorDetailsComponent } from './bin-estimators/bin-estimator-details';
import { BinEstimatorDetailsTabComponent } from './bin-estimators/bin-estimator-details-tab';
import { BinEstimatorSamplesTabComponent } from './bin-estimators/bin-estimator-samples-tab';
import { BinEstimatorCreatorComponent } from './bin-estimators/bin-estimator-creator';
import { BinEstimatorAnalysisSettingsComponent } from './bin-estimators/analysis-settings-tab';
import { BinEstimatorBinTabComponent } from './bin-estimators/bin-estimator-bins-tab';
import { BinEstimatorParametersFormComponent } from './bin-estimators/bin-estimator-parameters-form';
import { BinPlotComponent } from './bin-estimators/bins-plot';

import { ArtifactEstimatorListComponent } from './artifact-estimators/artifact-estimator-list';
import { ArtifactEstimatorCreatorComponent } from './artifact-estimators/artifact-estimator-creator';
import { ArtifactEstimatorDetailsTabComponent } from './artifact-estimators/artifact-estimator-details-tab';
import { ArtifactEstimatorDetailsComponent } from './artifact-estimators/artifact-estimator-details';
import { ArtifactPlotComponent } from './artifact-estimators/artifact-plot';
import { ArtifactEstimatorEquationsTabComponent } from './artifact-estimators/artifact-estimator-equations-tab';
import { ArtifactEstimatorParametersFormComponent } from './artifact-estimators/artifact-estimator-parameters-form';
import { ArtifactEstimatorAnalysisSettingsComponent } from './artifact-estimators/analysis-settings-tab';
import { ArtifactEstimatorSamplesTabComponent } from './artifact-estimators/artifact-estimator-samples-tab';

import { GenotypingProjectCreatorComponent } from './genotyping-project/genotyping-project-creator';
import { GenotypingProjectListComponent } from './genotyping-project/genotyping-project-list';
import { GenotypingProjectDetailsComponent } from './genotyping-project/genotyping-project-details';
import { GenotypingProjectDetailsTabComponent } from './genotyping-project/genotyping-project-details-tab';

import { QuantificationBiasEstimatorListComponent } from './quant-bias-estimators/quant-bias-estimator-list';
import { QuantificationBiasEstimatorCreatorComponent } from './quant-bias-estimators/quant-bias-estimator-creator';
import { GenotypingProjectParametersFormComponent } from './genotyping-project/genotyping-project-parameters-form';
import { GenotypingProjectAnalysisSettingsComponent } from './genotyping-project/analysis-settings-tab';

import { SampleSelectorListComponent } from './projects/sample-list';
import { FilterParametersFormComponent } from './projects/filter-parameters-form';
import { ScanningParametersFormComponent } from './projects/scanning-parameters-form';
import { ProjectLocusListComponent } from './projects/locus-list';
import { LocusSelectorListComponent } from './projects/locus-parameters-list';

import { QuantificationBiasEstimatorDetailsComponent } from './quant-bias-estimators/quant-bias-estimator-details';
import { QuantificationBiasEstimatorProjectDetailsTabComponent } from './quant-bias-estimators/quant-bias-estimator-details-tab';
import { QuantifiactionBiasEstimatorProjectControlsTabComponent } from './quant-bias-estimators/quant-bias-estimator-controls-tab';
import { QuantificationBiasEstimatorParametersFormComponent } from './quant-bias-estimators/quant-bias-estimator-parameters-form';
import { QuantificationBiasEstimatorProjectAnalysisSettingsComponent } from './quant-bias-estimators/analysis-settings-tab';


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
  SampleListComponent,
  SampleUploaderComponent,
  SampleDetailsComponent,
  ControlListComponent,
  ControlDetailsComponent,
  BinEstimatorListComponent,
  BinEstimatorDetailsComponent,
  BinEstimatorDetailsTabComponent,
  BinEstimatorSamplesTabComponent,
  BinEstimatorCreatorComponent,
  BinEstimatorAnalysisSettingsComponent,
  BinEstimatorParametersFormComponent,
  BinEstimatorBinTabComponent,
  BinPlotComponent,
  ArtifactEstimatorListComponent,
  ArtifactEstimatorCreatorComponent,
  ArtifactEstimatorDetailsComponent,
  ArtifactEstimatorDetailsTabComponent,
  ArtifactEstimatorSamplesTabComponent,
  ArtifactEstimatorAnalysisSettingsComponent,
  ArtifactEstimatorParametersFormComponent,
  ArtifactEstimatorEquationsTabComponent,
  ArtifactPlotComponent,
  QuantificationBiasEstimatorListComponent,
  QuantificationBiasEstimatorCreatorComponent,
  QuantificationBiasEstimatorDetailsComponent,
  QuantificationBiasEstimatorProjectDetailsTabComponent,
  QuantifiactionBiasEstimatorProjectControlsTabComponent,
  QuantificationBiasEstimatorParametersFormComponent,
  QuantificationBiasEstimatorProjectAnalysisSettingsComponent,
  GenotypingProjectListComponent,
  GenotypingProjectCreatorComponent,
  GenotypingProjectDetailsComponent,
  GenotypingProjectDetailsTabComponent,
  GenotypingProjectAnalysisSettingsComponent,
  GenotypingProjectParametersFormComponent,
  GenotypingProjectSamplesTabComponent,
  GenotypeEditorTabComponent,
  GenotypeListComponent,
  GenotypeTraceDisplayComponent,
  GenotypeViewerTabComponent,
  SampleGenotypingListComponent,
  ProjectLocusListComponent,
  FilterParametersFormComponent,
  ScanningParametersFormComponent,
  SampleSelectorListComponent,
  LocusSelectorListComponent,
  TraceDisplayComponent,
  FileInputComponent,
  TaskDisplayComponent,
  TruncateStringPipe,
  BaseSizePipe
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
