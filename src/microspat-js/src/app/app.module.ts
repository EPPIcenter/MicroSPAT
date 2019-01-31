import { BrowserModule } from '@angular/platform-browser';
import { NgModule, InjectionToken } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { StoreModule, ActionReducerMap, META_REDUCERS } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import { CommonModule } from '@angular/common';

import { AppComponent } from './containers/app';

import { GlobalWebSocket } from './services/global';

import { ArtifactEquationService } from './services/artifact-estimator/artifact-equation';
import { ArtifactEstimatorService } from './services/artifact-estimator/artifact-estimator';
import { LocusArtifactEstimatorService } from './services/artifact-estimator/locus-artifact-estimator';
import { ArtifactEstimatorLocusParamsService } from './services/artifact-estimator/locus-params';
import { ArtifactEstimatorProjectService } from './services/artifact-estimator/project';

import { BinService } from './services/bin-estimator/bin';
import { LocusBinSetService } from './services/bin-estimator/locus-bin-set';
import { BinEstimatorLocusParamsService } from './services/bin-estimator/locus-params';
import { BinEstimatorProjectService } from './services/bin-estimator/project';

import { GenotypingLocusParamsService } from './services/genotyping/locus-params';
import { GenotypingProjectService } from './services/genotyping/project';

import { LocusSetService } from './services/locus/locus-set';
import { LocusService } from './services/locus/locus';

import { ProjectChannelAnnotationsService } from './services/project/channel-annotations';
import { ProjectSampleAnnotationsService } from './services/project/sample-annotations';

import { QuantificationBiasEstimatorLocusParamsService } from './services/quantification-bias-estimator/locus-params';
import { QuantificationBiasEstimatorProjectService } from './services/quantification-bias-estimator/project';

import { ControlSampleAssociationService } from './services/sample/control-sample-association';
import { ControlService } from './services/sample/control';
import { GenotypeService } from './services/sample/genotype';
import { SampleLocusAnnotationService } from './services/sample/sample-locus-annotation';
import { SampleService } from './services/sample/sample';

import { ChannelService } from './services/ce/channel';
import { LadderService } from './services/ce/ladder';
import { PlateService } from './services/ce/plate';
import { WellService } from './services/ce/well';

import { BaseDBEffects } from './effects/db/base';
import { PlateEffects } from './effects/plates';
import { LadderEffects } from './effects/ladders';
import { LocusEffects } from './effects/loci';
import { LocusSetEffects } from './effects/locus-sets';
import { TaskEffects } from './effects/tasks';
import { SampleEffects } from './effects/samples';
import { BinEstimatorEffects } from './effects/bin-estimators';
import { ArtifactEstimatorEffects } from './effects/artifact-estimators';
import { QuantificationBiasEstimatorEffects } from './effects/quant-bias-estimators';
import { GenotypingProjectEffects } from './effects/genotyping-projects';

import { AppReducer, AppState } from './reducers';

import { ContainerModule } from './containers';
import { AppRoutingModule } from './routes';

import { KeyboardService } from './services/keyboard';
import { ControlEffects } from './effects/controls';

export const REDUCER_TOKEN = new InjectionToken<ActionReducerMap<AppState>>('Registered Reducers');

export function getReducers(appReducer: AppReducer) {
  return appReducer.getReducers();
}

export function getMetaReducers(appReducer: AppReducer) {
  return appReducer.getMetaReducers();
}

@NgModule({
  imports: [
    NgxDatatableModule,
    CommonModule,
    BrowserModule,
    HttpClientModule,
    ContainerModule,
    AppRoutingModule,
    StoreModule.forRoot(REDUCER_TOKEN),
    EffectsModule.forRoot(
      [
        BaseDBEffects, TaskEffects, PlateEffects, LadderEffects,
        LocusEffects, LocusSetEffects, SampleEffects, ControlEffects, BinEstimatorEffects,
        ArtifactEstimatorEffects, GenotypingProjectEffects, QuantificationBiasEstimatorEffects
      ]
    )
  ],
  providers: [
    GlobalWebSocket,
    AppReducer,
    ArtifactEquationService,
    ArtifactEstimatorService,
    LocusArtifactEstimatorService,
    ArtifactEstimatorLocusParamsService,
    ArtifactEstimatorProjectService,
    BinService,
    LocusBinSetService,
    BinEstimatorLocusParamsService,
    BinEstimatorProjectService,
    GenotypingLocusParamsService,
    GenotypingProjectService,
    LocusSetService,
    LocusService,
    ProjectChannelAnnotationsService,
    ProjectSampleAnnotationsService,
    QuantificationBiasEstimatorLocusParamsService,
    QuantificationBiasEstimatorProjectService,
    ControlSampleAssociationService,
    ControlService,
    GenotypeService,
    SampleLocusAnnotationService,
    SampleService,
    LadderService,
    ChannelService,
    WellService,
    PlateService,
    {
      provide: REDUCER_TOKEN,
      deps: [AppReducer],
      useFactory: getReducers
    },
    {
      provide: META_REDUCERS,
      deps: [AppReducer],
      useFactory: getMetaReducers
    },
    KeyboardService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
