import { CreateGenotypingProjectAction } from './../actions/genotyping-projects';
import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { Component } from '@angular/core';

import * as genotypingProjects from 'app/actions/genotyping-projects';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';
import * as fromGenotypingProjects from 'app/reducers/genotyping-projects/genotyping-projects';

import { GenotypingProject } from 'app/models/genotyping/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { BinEstimatorProject } from '../models/bin-estimator/project';
import { ArtifactEstimatorProject } from '../models/artifact-estimator/project';
import { Task } from 'app/models/task';
import { GenotypingLocusParams } from 'app/models/genotyping/locus-params';
import { Sample } from 'app/models/sample/sample';
import { Locus } from 'app/models/locus/locus';
import { Genotype } from 'app/models/sample/genotype';
import { GenotypeFilter } from 'app/reducers/genotyping-projects/genotyping-projects';
import { TraceDisplay } from './components/genotyping-project/genotype-trace-display';


@Component({
  selector: 'mspat-genotyping-projects',
  template: `
  <div [ngSwitch]="appState$ | async">

    <div *ngSwitchCase="states.list_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-6">
          <mspat-genotyping-project-list
            [genotypingProjects]="genotypingProjects$ | async"
            [genotypingProjectsLoading]="genotypingProjectsLoading$ | async"
            [activeTasks]="activeTasks$ | async"
            (selectGenotypingProject)="selectGenotypingProject($event)">
          </mspat-genotyping-project-list>
        </div>
        <div class="col-sm-6">
          <mspat-genotyping-project-creator
            [locusSets]="locusSets$ | async"
            [binEstimators]="binEstimators$ | async"
            [artifactEstimators]="artifactEstimators$ | async"
            [quantificationBiasEstimators]="quantificationBiasEstimators$ | async"
            [activeTasks]="activeTasks$ | async"
            [failedTasks]="failedTasks$ | async"
            (submit)="createGenotypingProject($event)">
          </mspat-genotyping-project-creator>
        </div>
      </div>
    </div>

    <div *ngSwitchCase="states.details_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-12">
          <mspat-genotyping-project-details
            [genotypingProject]="activeGenotypingProject$ | async"
            [locusSet]="activeLocusSet$ | async"
            [binEstimatorProject]="activeBinEstimatorProject$ | async"
            [artifactEstimatorProject]="activeArtifactEstimatorProject$ | async"
            [quantificationBiasEstimatorProject]="activeQuantificationBiasEstimatorProject$ | async"
            [activeTasks]="activeTasks$ | async"
            [failedTasks]="failedTasks$ | async"
            [activeSamples]="activeSamples$ | async"
            [inactiveSamples]="inactiveSamples$ | async"
            [activeLocusParameters]="activeLocusParameters$ | async"
            [loci]="loci$ | async"
            [filteredGenotypes]="filteredGenotypes$ | async"
            [activeGenotypeID]="activeGenotypeID$ | async"
            [loadingGenotype]="loadingGenotype$ | async"
            [referenceRunDisplay]="referenceRunDisplay$ | async"
            [nonReferenceRunDisplays]="nonReferenceRunDisplays$ | async"
            [nonReferenceRunDisplay]="nonReferenceRunDisplay$ | async"
            [activeSample]="activeSample$ | async"
            [sampleGenotypes]="sampleGenotypes$ | async"
            [allGenotypes]="allGenotypes$ | async"
            [selectedGenotypeID]="selectedGenotypeID$ | async"
            (genotypesDetailTabChange)="setGenotypesDetailTab($event)"
            (deleteGenotypingProject)="deleteGenotypingProject($event)"
            (addSamples)="addSamples($event)"
            (addSamplesFile)="addSamplesFile($event)"
            (removeSamples)="removeSamples($event)"
            (analyzeLoci)="analyzeLoci($event)"
            (applyFilter)="applyFilter($event)"
            (clearFilter)="clearFilter($event)"
            (selectGenotype)="activateGenotype($event)"
            (selectFilteredGenotype)="activateGenotype($event)"
            (toggleShowNonReferenceRuns)="toggleShowNonReferenceRuns()"
            (toggleAllele)="toggleAllele($event)"
            (selectSample)="selectSample($event)"
            (getPeakData)="getPeakData($event)"
            (getAlleleData)="getAlleleData($event)"
            (calculatePeakProbabilities)="calculatePeakProbabilities($event)">
          </mspat-genotyping-project-details>
        </div>
      </div>
    </div>
  </div>
  `
})
export class GenotypingProjectsComponent {
  appState$: Observable<string>;

  genotypingProjects$: Observable<GenotypingProject[]>;
  genotypingProjectsLoading$: Observable<boolean>;

  locusSets$: Observable<LocusSet[]>;
  binEstimators$: Observable<BinEstimatorProject[]>;
  artifactEstimators$: Observable<ArtifactEstimatorProject[]>;
  quantificationBiasEstimators$: Observable<QuantificationBiasEstimatorProject[]>;

  activeGenotypingProject$: Observable<GenotypingProject>;
  activeLocusSet$: Observable<LocusSet>;
  activeBinEstimatorProject$: Observable<BinEstimatorProject>;
  activeArtifactEstimatorProject$: Observable<ArtifactEstimatorProject>;
  activeQuantificationBiasEstimatorProject$: Observable<QuantificationBiasEstimatorProject>;

  activeSamples$: Observable<Sample[]>;
  inactiveSamples$: Observable<Sample[]>;

  activeLocusParameters$: Observable<GenotypingLocusParams[]>;

  loci$: Observable<Locus[]>;
  filteredGenotypes$: Observable<Genotype[]>;
  activeGenotypeID$: Observable<number>;
  loadingGenotype$: Observable<boolean>;
  referenceRunDisplay$: Observable<TraceDisplay>;
  nonReferenceRunDisplays$: Observable<TraceDisplay[]>;
  nonReferenceRunDisplay$: Observable<boolean>;

  activeSample$: Observable<Sample>;
  allGenotypes$: Observable<Genotype[]>;
  sampleGenotypes$: Observable<Genotype[]>;
  selectedGenotypeID$: Observable<number>;

  activeTasks$: Observable<Task[]>;
  failedTasks$: Observable<Task[]>;

  states = {
    list_state: 'list',
    details_state: 'details',
  }

  constructor(private store: Store<fromRoot.AppState>) {
    this.appState$ = this.store.select(fromGenotypingProjects.selectAppState);

    this.genotypingProjects$ = this.store.select(fromDB.selectGenotypingProjectList);
    this.genotypingProjectsLoading$ = this.store.select(fromGenotypingProjects.selectLoadingGenotypingProjects);

    this.locusSets$ = this.store.select(fromDB.selectLocusSetList);
    this.binEstimators$ = this.store.select(fromDB.selectBinEstimatorProjectList);
    this.artifactEstimators$ = this.store.select(fromDB.selectArtifactEstimatorProjectList);
    this.quantificationBiasEstimators$ = this.store.select(fromDB.selectQuantificationBiasEstimatorProjectList);

    this.activeGenotypingProject$ = this.store.select(fromGenotypingProjects.selectActiveGenotypingProject);
    this.activeLocusSet$ = this.store.select(fromGenotypingProjects.selectActiveLocusSet);
    this.activeBinEstimatorProject$ = this.store.select(fromGenotypingProjects.selectActiveBinEstimator);
    this.activeArtifactEstimatorProject$ = this.store.select(fromGenotypingProjects.selectActiveArtifactEstimator);
    this.activeQuantificationBiasEstimatorProject$ = this.store.select(fromGenotypingProjects.selectActiveQuantificationBiasEstimator);

    this.activeSamples$ = this.store.select(fromGenotypingProjects.selectActiveSamples);
    this.inactiveSamples$ = this.store.select(fromGenotypingProjects.selectInactiveSamples);
    this.activeLocusParameters$ = this.store.select(fromGenotypingProjects.selectActiveLocusParameters);

    this.loci$ = this.store.select(fromGenotypingProjects.selectActiveLoci);
    this.filteredGenotypes$ = this.store.select(fromGenotypingProjects.selectFilteredGenotypes);
    this.activeGenotypeID$ = this.store.select(fromGenotypingProjects.selectActiveGenotypeID);
    this.loadingGenotype$ = this.store.select(fromGenotypingProjects.selectGenotypeIsLoading);
    this.referenceRunDisplay$ = this.store.select(fromGenotypingProjects.selectReferenceRunDisplay);
    this.nonReferenceRunDisplays$ = this.store.select(fromGenotypingProjects.selectNonReferenceRunDisplays);
    this.nonReferenceRunDisplay$ = this.store.select(fromGenotypingProjects.selectShowNonReferenceRuns);

    this.activeSample$ = this.store.select(fromGenotypingProjects.selectActiveSample);
    this.allGenotypes$ = this.store.select(fromGenotypingProjects.selectActiveGenotypes);
    this.sampleGenotypes$ = this.store.select(fromGenotypingProjects.selectActiveSampleGenotypes);
    this.selectedGenotypeID$ = this.store.select(fromGenotypingProjects.selectActiveGenotypeID);

    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.failedTasks$ = this.store.select(fromTasks.selectFailedTasks());
  }

  selectGenotypingProject(e: number) {
    this.store.dispatch(new genotypingProjects.SelectGenotypingProjectAction(e));
  }

  createGenotypingProject(e: any) {
    this.store.dispatch(new genotypingProjects.CreateGenotypingProjectAction(e));
  }

  setGenotypesDetailTab(e: string) {
    this.store.dispatch(new genotypingProjects.SetDetailTabAction(e));
  }

  deleteGenotypingProject(e: number) {
    this.store.dispatch(new genotypingProjects.DeleteGenotypingProjectAction(e));
  }

  addSamples(e: any) {
    this.store.dispatch(new genotypingProjects.AddSamplesAction(e));
  }

  removeSamples(e: any) {
    this.store.dispatch(new genotypingProjects.RemoveSamplesAction(e));
  }

  addSamplesFile(e: {samplesFile: File, projectID: number}) {
    this.store.dispatch(new genotypingProjects.AddSamplesFileAction(e));
  }

  analyzeLoci(e: any) {
    this.store.dispatch(new genotypingProjects.AnalyzeLociAction(e));
  }

  applyFilter(e: GenotypeFilter) {
    this.store.dispatch(new genotypingProjects.ApplyGenotypeFilterAction(e));
  }

  clearFilter() {
    this.store.dispatch(new genotypingProjects.ClearGenotypeFilterAction());
  }

  activateGenotype(e: number) {
    this.store.dispatch(new genotypingProjects.ActivateGenotypeAction(e))
  }

  toggleShowNonReferenceRuns() {
    this.store.dispatch(new genotypingProjects.ToggleShowNonReferenceRunsAction());
  }

  toggleAllele(e: {binID: number, genotypeID: number}) {
    this.store.dispatch(new genotypingProjects.ToggleAlleleAction(e));
  }

  // selectSampleGenotype(e: number) {
  //   this.store.dispatch(new genotypingProjects.SelectSampleGenotypeAction(e));
  // }

  // selectFilteredGenotype(e: number) {
  //   this.store.dispatch(new genotypingProjects.SelectFilteredGenotypeAction(e));
  // }

  selectSample(e: number) {
    this.store.dispatch(new genotypingProjects.SelectSampleAction(e));
  }

  getPeakData(e: number) {
    this.store.dispatch(new genotypingProjects.GetPeakDataAction(e));
  }

  getAlleleData(e: number) {
    this.store.dispatch(new genotypingProjects.GetAlleleDataAction(e));
  }

  calculatePeakProbabilities(e: number) {
    this.store.dispatch(new genotypingProjects.CalculatePeakProbabilitiesAction(e));
  }
}
