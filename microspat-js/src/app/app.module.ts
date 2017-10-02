import { BrowserModule } from '@angular/platform-browser';
import { NgModule, InjectionToken } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';
import { StoreModule, ActionReducerMap, ActionReducerFactory, MetaReducer, META_REDUCERS } from '@ngrx/store';

import { AppComponent } from './app.component';

import { GlobalWebSocket } from './services/global';

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

import { DBReducer, State } from 'app/reducers';

export const REDUCER_TOKEN = new InjectionToken<ActionReducerMap<State>>('Registered Reducers');

export function getReducers(dbReducer: DBReducer) {
  return dbReducer.getReducers();
}

export function getMetaReducers(dbReducer: DBReducer) {
  return dbReducer.getMetaReducers();
}

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpModule,
    StoreModule.forRoot(REDUCER_TOKEN),
  ],
  providers: [
    GlobalWebSocket,
    DBReducer,
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
      deps: [DBReducer],
      useFactory: getReducers
    },
    {
      provide: META_REDUCERS,
      deps: [DBReducer],
      useFactory: getMetaReducers
    }
    // PlateActionSet
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
