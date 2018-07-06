import { BrowserModule } from '@angular/platform-browser';
import { NgModule, InjectionToken } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { StoreModule, ActionReducerMap, META_REDUCERS } from '@ngrx/store';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import { CommonModule } from '@angular/common';

import { AppComponent } from 'app/containers/app';

import { GlobalWebSocket } from 'app/services/global';

import { ArtifactEquationService } from 'app/services/artifact-estimator/artifact-equation';
import { ArtifactEstimatorService } from 'app/services/artifact-estimator/artifact-estimator';
import { LocusArtifactEstimatorService } from 'app/services/artifact-estimator/locus-artifact-estimator';
import { ArtifactEstimatorLocusParamsService } from 'app/services/artifact-estimator/locus-params';
import { ArtifactEstimatorProjectService } from 'app/services/artifact-estimator/project';

import { BinService } from 'app/services/bin-estimator/bin';
import { LocusBinSetService } from 'app/services/bin-estimator/locus-bin-set';
import { BinEstimatorLocusParamsService } from 'app/services/bin-estimator/locus-params';
import { BinEstimatorProjectService } from 'app/services/bin-estimator/project';

import { GenotypingLocusParamsService } from 'app/services/genotyping/locus-params';
import { GenotypingProjectService } from 'app/services/genotyping/project';

import { LocusSetService } from 'app/services/locus/locus-set';
import { LocusService } from 'app/services/locus/locus';

import { ProjectChannelAnnotationsService } from 'app/services/project/channel-annotations';
import { ProjectSampleAnnotationsService } from 'app/services/project/sample-annotations';

import { QuantificationBiasEstimatorLocusParamsService } from 'app/services/quantification-bias-estimator/locus-params';
import { QuantificationBiasEstimatorProjectService } from 'app/services/quantification-bias-estimator/project';

import { ControlSampleAssociationService } from 'app/services/sample/control-sample-association';
import { ControlService } from 'app/services/sample/control';
import { GenotypeService } from 'app/services/sample/genotype';
import { SampleLocusAnnotationService } from 'app/services/sample/sample-locus-annotation';
import { SampleService } from 'app/services/sample/sample';

import { ChannelService } from 'app/services/ce/channel';
import { LadderService } from 'app/services/ce/ladder';
import { PlateService } from 'app/services/ce/plate';
import { WellService } from 'app/services/ce/well';

import { BaseDBEffects } from 'app/effects/db/base';
import { PlateEffects } from 'app/effects/plates';
import { LadderEffects } from 'app/effects/ladders';
import { LocusEffects } from 'app/effects/loci';
import { LocusSetEffects } from 'app/effects/locus-sets';
import { TaskEffects } from 'app/effects/tasks';
import { SampleEffects } from 'app/effects/samples';

import { AppReducer, AppState } from 'app/reducers';
import { EffectsModule } from '@ngrx/effects';
import { ContainerModule } from 'app/containers';
import { AppRoutingModule } from 'app/routes';

import { KeyboardService } from 'app/services/keyboard';



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
    EffectsModule.forRoot([BaseDBEffects, TaskEffects, PlateEffects, LadderEffects, LocusEffects, LocusSetEffects, SampleEffects])
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
