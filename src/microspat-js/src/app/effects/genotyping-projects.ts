import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { empty, Observable, of } from 'rxjs';
import { map, switchMap, withLatestFrom } from 'rxjs/operators';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromGenotypingProject from 'app/reducers/genotyping-projects/genotyping-projects';

import * as db from 'app/actions/db';
import * as genotypingProjects from 'app/actions/genotyping-projects';
import * as keyboard from 'app/actions/keyboard';

import { EntityMap } from 'app/models/base';
import { Channel } from 'app/models/ce/channel';
import { GenotypingProject } from 'app/models/genotyping/project';
import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { Genotype } from 'app/models/sample/genotype';
import { Sample } from 'app/models/sample/sample';

import { GenotypingProjectService } from 'app/services/genotyping/project';

@Injectable()
export class GenotypingProjectEffects {

  @Effect()
  selectGenotypingProject$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.SelectGenotypingProjectAction>(genotypingProjects.SELECT_GENOTYPING_PROJECT),
    map((action) => action.payload),
    withLatestFrom(this.store.select(fromDB.selectGenotypingProjectEntities), (id: string | number, genotypingProjectsEntities: EntityMap<GenotypingProject>) => ({id, genotypingProjectsEntities})),
    map( ( {id, genotypingProjectsEntities} ) => {
      if (!genotypingProjectsEntities[id]) {
        return new genotypingProjects.DeactivateGenotypingProjectAction();
      } else if (genotypingProjectsEntities[id].detailed) {
        return new genotypingProjects.ActivateGenotypingProjectAction(+id);
      } else {
        return new genotypingProjects.LoadingGenotypingProjectAction(+id);
      }
    }),
  );

  @Effect()
  loadingGenotyping$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.LoadingGenotypingProjectAction>(genotypingProjects.LOADING_GENOTYPING_PROJECT),
    map((action) => {
      return action.payload;
    }),
    map((ids) => {
      if (!Array.isArray(ids)) {
        return [ids];
      } else {
        return ids;
      }
    }),
    withLatestFrom(
      this.store.select(fromDB.selectBinEstimatorProjectEntities),
      this.store.select(fromDB.selectArtifactEstimatorProjectEntities),
      this.store.select(fromDB.selectQuantificationBiasEstimatorProjectEntities),
      this.store.select(fromDB.selectGenotypingProjectEntities),
      (ids: number[], binProjs, artProjs, quantProjs, genoProjs) => ({ids, binProjs, artProjs, quantProjs, genoProjs})),
    switchMap( ( {ids, binProjs, artProjs, quantProjs, genoProjs} ) => {
      // const binEstimatorIDs = ids.map((id) => genoProjs[id].bin_estimator).filter((id) => id).filter((binID) => binProjs[binID] != null ? !binProjs[binID].detailed : true);
      // const artEstimatorIDs = ids.map((id) => genoProjs[id].artifact_estimator).filter((id) => id).filter((artID) => artProjs[artID] != null ? !artProjs[artID].detailed : true);
      // const quantEstimatorIDs = ids.map((id) => genoProjs[id].quantification_bias_estimator).filter((id) => id).filter((quantID) => quantProjs[quantID] != null ? !quantProjs[quantID].detailed : true);
      const res = [];
      // if (binEstimatorIDs.length > 0) {
      //   res.push(new db.GetRequestedAction({model: 'bin_estimator_project', ids: binEstimatorIDs}));
      // }

      // if (artEstimatorIDs.length > 0) {
      //   res.push(new db.GetRequestedAction({model: 'artifact_estimator_project', ids: artEstimatorIDs}));
      // }

      // if (quantEstimatorIDs.length > 0) {
      //   res.push(new db.GetRequestedAction({model: 'quantification_bias_estimator_project', ids: quantEstimatorIDs}))
      // }

      if (ids.length > 0) {
        res.push(new db.GetRequestedAction({model: 'genotyping_project', ids}))
      }

      return res;
    }),

  );

  @Effect()
  deleteGenotypingProject$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.DeleteGenotypingProjectAction>(genotypingProjects.DELETE_GENOTYPING_PROJECT),
    map((action) => {
      return action.payload;
    }),
    map((id) => {
      this.genotypingProjectService.deleteGenotypingProject(id);
    }),
    map(() => new genotypingProjects.DeactivateGenotypingProjectAction())
  )

  @Effect({dispatch: false})
  createGenotyping$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.CreateGenotypingProjectAction>(genotypingProjects.CREATE_GENOTYPING_PROJECT),
    map((action) => {
      return action.payload;
    }),
    map((ae) => {
      this.genotypingProjectService.createGenotypingProject(ae);
    }),
  )

  @Effect({dispatch: false})
  addSamples$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.AddSamplesAction>(genotypingProjects.ADD_SAMPLES),
    map((action) => {
      return action.payload;
    }),
    map((payload) => {
      this.genotypingProjectService.addSamples(payload.project_id, payload.sample_ids);
    }),
  )

  @Effect({dispatch: false})
  removeSamples$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.RemoveSamplesAction>(genotypingProjects.REMOVE_SAMPLES),
    map((action) => {
      return action.payload;
    }),
    map((payload) => {
      this.genotypingProjectService.removeSamples(payload.project_id, payload.sample_ids);
    }),
  )

  @Effect({dispatch: false})
  addSamplesFile$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.AddSamplesFileAction>(genotypingProjects.ADD_SAMPLES_FILE),
    map((action) => action.payload),
    map((payload) => {
      this.genotypingProjectService.uploadSampleFile(payload.samplesFile, payload.projectID);
    }),
  )

  @Effect({dispatch: false})
  analyzeLoci$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.AnalyzeLociAction>(genotypingProjects.ANALYZE_LOCI),
    map((action) => {
      return action.payload;
    }),
    map((payload) => {
      if (payload.parameter_settings) {
        this.genotypingProjectService.analyzeLoci(payload.locus_parameter_ids, payload.parameter_settings);
      } else {
        this.genotypingProjectService.analyzeLoci(payload.locus_parameter_ids);
      }
    }),
  )

  @Effect()
  selectGenotype$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.ActivateGenotypeAction>(genotypingProjects.ACTIVATE_GENOTYPE),
    withLatestFrom(this.store.select(fromGenotypingProject.selectFilteredChannels), (_ , channels: Channel[]) => ({channels})),
    map(({channels}) => {
      const toGet = channels.filter(channel => !channel.detailed).map(ch => ch.id);
      // const sampleAnnotations = genotype.sample_annotations as ProjectSampleAnnotations;
      // const sample = sampleAnnotations.sample as Sample;
      return new genotypingProjects.LoadChannelsAction(toGet);
    }),
  );

  // @Effect()
  // selectFilteredGenotype$: Observable<any> = this.actions$.pipe(
  //   ofType<genotypingProjects.SelectFilteredGenotypeAction>(genotypingProjects.SELECT_FILTERED_GENOTYPE),
  //   withLatestFrom(this.store.select(fromGenotypingProject.selectActiveGenotype), (_, genotype: Genotype) => {})
  // )

  @Effect()
  loadChannels$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.LoadChannelsAction>(genotypingProjects.LOAD_CHANNELS),
    map((action) => action.payload),
    withLatestFrom(this.store.select(fromDB.selectChannelEntities), (ids: (string | number)[], channels: EntityMap<Channel>) => ({ids, channels})),
    switchMap( ( {ids, channels} ) => {
      const toRequest = ids.filter(id => {
        if (!channels[id] || !channels[id].detailed) {
          return id
        }
      })
      if (ids.length > 0) {
        return [ new genotypingProjects.LoadingChannelsAction(ids), new db.GetRequestedAction({model: 'channel', ids: ids})]
      } else {
        return empty();
      }
    })
  )

  @Effect()
  toggleAllele$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.ToggleAlleleAction>(genotypingProjects.TOGGLE_ALLELE),
    map((action) => action.payload),
    map((payload) => {
      this.genotypingProjectService.toggleAllele(payload.binID, payload.genotypeID);
      return payload;
    }),
    withLatestFrom(this.store.select(fromDB.selectGenotypeEntities), (payload, genotypes) => ({payload, genotypes})),
    map( ( { payload, genotypes } ) => {
      const genotype: Genotype = genotypes[payload.genotypeID]
      const updatedAlleles = Object.assign({}, genotype.alleles, {
        [payload.binID]: !genotype.alleles[payload.binID]
      });

      const genotypeUpdate = {
        id: genotype.id,
        alleles: updatedAlleles,
      }
      // updatedGenotype.alleles[payload.binID] = !updatedGenotype.alleles[payload.binID]
      return new db.LocalUpdateAction({model: 'genotype', entities: [genotypeUpdate]})
    }),
  )

  @Effect()
  scrollGenotype$: Observable<any> = this.actions$.pipe(
    ofType<keyboard.KeyDownAction>(keyboard.KEY_DOWN),
    map((action) => action.payload),
    withLatestFrom(
      this.store.select(fromGenotypingProject.selectFilteredGenotypes),
      this.store.select(fromGenotypingProject.selectActiveGenotypeID),
      (payload, genotypes, activeGenotypeID) => ({payload, genotypes, activeGenotypeID})
    ),
    switchMap( ( { payload, genotypes, activeGenotypeID } ) => {
      const genotypeIDs = genotypes.map((g) => +g.id);
      const currPos = genotypeIDs.indexOf(+activeGenotypeID);

      if (currPos === -1) {
        return empty();
      }

      if (payload.key === 'ArrowUp') {
        if (currPos === 0) {
          return empty();
        } else {
          return [new genotypingProjects.ActivateGenotypeAction(genotypeIDs[currPos - 1])];
        }
      } else if (payload.key === 'ArrowDown') {
        if (currPos === genotypeIDs.length - 1) {
          return empty();
        } else {
          return [new genotypingProjects.ActivateGenotypeAction(genotypeIDs[currPos + 1])];
        }
      } else {
        return empty();
      }
    }),
  )

  @Effect({dispatch: false})
  getPeakData$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.GetPeakDataAction>(genotypingProjects.GET_PEAK_DATA),
    map((action) => action.payload),
    map((payload) => {
      this.genotypingProjectService.getPeakData(payload);
    }),
  )

  @Effect({dispatch: false})
  getAlleleData$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.GetAlleleDataAction>(genotypingProjects.GET_ALLELE_DATA),
    map((action) => action.payload),
    map((payload) => {
      this.genotypingProjectService.getAlleles(payload);
    }),
  )

  @Effect({dispatch: false})
  calculatePeakProbabilities$: Observable<any> = this.actions$.pipe(
    ofType<genotypingProjects.CalculatePeakProbabilitiesAction>(genotypingProjects.CALCULATE_PEAK_PROBABILITIES),
    map((action) => action.payload),
    map((payload) => {
      this.genotypingProjectService.calculatePeakProbabilities(payload);
    }),
  )

  constructor(
    private actions$: Actions,
    private store: Store<fromRoot.AppState>,
    private genotypingProjectService: GenotypingProjectService,
  ) {}
}
