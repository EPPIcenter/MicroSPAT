import { QuantificationBiasEstimatorProjectService } from 'app/services/quantification-bias-estimator/project';
import { GenotypeService } from 'app/services/sample/genotype';
import { GenotypingLocusParamsService } from 'app/services/genotyping/locus-params';
import { GenotypingProjectService } from 'app/services/genotyping/project';
import { ArtifactEquationService } from 'app/services/artifact-estimator/artifact-equation';
import { LocusArtifactEstimatorService } from 'app/services/artifact-estimator/locus-artifact-estimator';
import { ArtifactEstimatorService } from 'app/services/artifact-estimator/artifact-estimator';

import { Component } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';

import { PlateService } from 'app/services/ce/plate';
import { WellService } from 'app/services/ce/well';
import { ChannelService } from 'app/services/ce/channel';
import { LocusService } from 'app/services/locus/locus';
import { KeyboardService } from 'app/services/keyboard';
import { LadderService } from 'app/services/ce/ladder';
import { LocusSetService } from 'app/services/locus/locus-set';
import { SampleService } from 'app/services/sample/sample';

import { ProjectSampleAnnotationsService } from 'app/services/project/sample-annotations';
import { ProjectChannelAnnotationsService } from 'app/services/project/channel-annotations';
import { SampleLocusAnnotationService } from 'app/services/sample/sample-locus-annotation';

import { BinEstimatorProjectService } from 'app/services/bin-estimator/project';
import { BinEstimatorLocusParamsService } from 'app/services/bin-estimator/locus-params';
import { LocusBinSetService } from 'app/services/bin-estimator/locus-bin-set';
import { BinService } from 'app/services/bin-estimator/bin';

import { ArtifactEstimatorProjectService } from 'app/services/artifact-estimator/project';
import { ArtifactEstimatorLocusParamsService } from 'app/services/artifact-estimator/locus-params';
import { Observable } from 'rxjs';
import { Task } from 'app/models/task';
import { Store } from '@ngrx/store';

import * as fromRoot from 'app/reducers';
import * as fromTasks from 'app/reducers/tasks';
import * as fromDB from 'app/reducers/db';
import * as fromGenotypingProjects from 'app/reducers/genotyping-projects/genotyping-projects';

import { ControlService } from 'app/services/sample/control';
import { ControlSampleAssociationService } from 'app/services/sample/control-sample-association';
import { QuantificationBiasEstimatorLocusParamsService } from 'app/services/quantification-bias-estimator/locus-params';


@Component({
  selector: 'mspat-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container-fluid mspat-container">
      <div class="row main-container">
        <div class="col-1 bg-light sidebar mat-elevation-z6">
          <mspat-sidenav [activeTasks]="activeTasks$ | async"></mspat-sidenav>
        </div>
        <div role="main" class="col-11 ml-sm-auto pt-3">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
  styles: [`

    .main-container {
      height: 100%
    }

  `]
})
export class AppComponent {
  public activeTasks$: Observable<Task[]>;

  constructor(
    private store: Store<fromRoot.AppState>,
    private keyboardService: KeyboardService,
    private plateService: PlateService,
    private wellService: WellService,
    private channelService: ChannelService,
    private ladderService: LadderService,
    private locusService: LocusService,
    private locusSetService: LocusSetService,
    private sampleService: SampleService,
    private controlService: ControlService,
    private projectChannelAnnotationsService: ProjectChannelAnnotationsService,
    private projectSampleAnnotationsService: ProjectSampleAnnotationsService,
    private sampleLocusAnnotationService: SampleLocusAnnotationService,

    private binEstimatorProjectService: BinEstimatorProjectService,
    private binEstimatorLocusParamsService: BinEstimatorLocusParamsService,
    private binService: BinService,
    private locusBinSetService: LocusBinSetService,

    private artifactEstimatorProjectService: ArtifactEstimatorProjectService,
    private artifactEstimatorLocusParamsService: ArtifactEstimatorLocusParamsService,
    private locusArtifactEstimatorService: LocusArtifactEstimatorService,
    private artifactEstimatorService: ArtifactEstimatorService,
    private artifactEquationService: ArtifactEquationService,

    private quantificationBiasEstimatorProjectService: QuantificationBiasEstimatorProjectService,
    private quantifiactiobBiasEstimatorLocusParamsSerice: QuantificationBiasEstimatorLocusParamsService,
    private controlSampleAssociationService: ControlSampleAssociationService,

    private genotypingProjectService: GenotypingProjectService,
    private genotypingLocusParamsService: GenotypingLocusParamsService,
    private genotypeService: GenotypeService
) {
    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.genotypingProjectService.list();
    this.binEstimatorProjectService.list();
    this.locusBinSetService.list();
    this.binService.list();
    this.artifactEstimatorProjectService.list();
    this.quantificationBiasEstimatorProjectService.list();
    this.plateService.list();
    this.ladderService.list();
    this.locusService.list();
    this.locusSetService.list();
    this.sampleService.list();
    this.controlService.list();
  }
}
