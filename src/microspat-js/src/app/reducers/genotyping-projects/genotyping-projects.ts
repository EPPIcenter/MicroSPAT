import { TraceDisplay } from './../../containers/components/genotyping-project/genotype-trace-display';
import { Circle } from 'app/containers/components/plots/canvas';
import { GenotypePeak } from './../../models/project/peak';
import { Genotype } from './../../models/sample/genotype';
import { ArtifactEstimatorProject } from './../../models/artifact-estimator/project';
import { GenotypingProject } from 'app/models/genotyping/project';
import { createSelector, createFeatureSelector} from '@ngrx/store';
import * as d3 from 'd3';
import * as fromDB from '../db';

import * as DBActions from 'app/actions/db';
import * as GenotypingProjectActions from 'app/actions/genotyping-projects';
import * as NavigationActions from 'app/actions/navigation';
import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { Sample } from 'app/models/sample/sample';
import { LocusSet } from 'app/models/locus/locus-set';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { EntityMap } from 'app/models/base';
import { Channel } from 'app/models/ce/channel';
import { Locus } from 'app/models/locus/locus';
import { Bar, Trace } from '../../containers/components/plots/canvas';
import { Well } from 'app/models/ce/well';
import { ProjectChannelAnnotations } from 'app/models/project/channel-annotations';


export interface GenotypeFilter {
  locus: number | string;
  sample_barcode_regex: string;
  genotype_flag: 'failure' | 'offscale' | 'out_of_bin' | 'all';
  crosstalk_limit: number;
  bleedthrough_limit: number;
  min_allele_count: number;
  max_allele_count: number;
  min_main_peak_height: number;
  max_main_peak_height: number;
}

export interface State {
  appState: 'list' | 'details';
  detailsState: string;
  genotypingProjectsLoaded: boolean;
  loadingGenotypingProjects: boolean;
  activeGenotypingProjectID: number;
  activeSampleID: number;
  genotypeFilter: GenotypeFilter;
  activeGenotypeID: number;
  loadingChannels: (number | string)[];
  showNonReferenceRuns: boolean;
}

const initialState: State = {
  appState: 'list',
  detailsState: null,
  genotypingProjectsLoaded: false,
  loadingGenotypingProjects: false,
  activeGenotypingProjectID: null,
  activeSampleID: null,
  genotypeFilter: {
    locus: null,
    sample_barcode_regex: null,
    genotype_flag: 'all',
    crosstalk_limit: null,
    bleedthrough_limit: null,
    min_allele_count: null,
    max_allele_count: null,
    min_main_peak_height: null,
    max_main_peak_height: null
  },
  activeGenotypeID: null,
  loadingChannels: [],
  showNonReferenceRuns: false
}

const COLORMAP = {
  'green': 'rgb(92, 184, 92)',
  'red': 'red',
  'blue': 'blue',
  'yellow': 'yellow'
}

export function reducer(state = initialState, action: DBActions.Actions | GenotypingProjectActions.Actions | NavigationActions.Actions) {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case DBActions.GET_RECEIVED:
      return dbGetReceived(state, action);

    case DBActions.DELETE_RECEIVED:
      return dbDeleteReceived(state, action);

    case NavigationActions.ACTIVATE_GENOTYPING_PROJECT_PATH:
      return activateGenotypingProjectPath(state, action);

    case GenotypingProjectActions.LOADING_GENOTYPING_PROJECTS:
      return loadingGenotypingProjects(state, action);

    case GenotypingProjectActions.LOADING_GENOTYPING_PROJECT:
      return activateGenotypingProject(state, action);

    case GenotypingProjectActions.ACTIVATE_GENOTYPING_PROJECT:
      return activateGenotypingProject(state, action);

    case GenotypingProjectActions.DEACTIVATE_GENOTYPING_PROJECT:
      return deactivateGenotypingProject(state, action);

    case GenotypingProjectActions.SET_DETAIL_TAB:
      return setDetailTab(state, action);

    case GenotypingProjectActions.APPLY_GENOTYPE_FILTER:
      return applyGenotypeFilter(state, action);

    case GenotypingProjectActions.CLEAR_GENOTYPE_FILTER:
      return clearGenotypeFilter(state, action);

    case GenotypingProjectActions.ACTIVATE_GENOTYPE:
      return activateGenotype(state, action);

    case GenotypingProjectActions.LOADING_CHANNELS:
      return loadingChannels(state, action);

    case GenotypingProjectActions.TOGGLE_SHOW_NON_REFERENCE_RUNS:
      return toggleShowNonReferenceRuns(state, action)

    case GenotypingProjectActions.SELECT_SAMPLE:
      return selectSample(state, action);

    default:
      return state
  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload && action.payload.model === fromDB.models.genotypingProject) {
    return Object.assign({}, state, {
      loadingGenotypingProjects: false,
      genotypingProjectsLoaded: true
    });
  }
  return state;
}

function dbGetReceived(state: State, action: DBActions.GetReceivedAction) {
  if (action.payload && action.payload.model === fromDB.models.channel) {
    const channels = action.payload.entities as Channel[];
    const channelIDs = channels.map(c => +c.id);
    const remainingChannels = state.loadingChannels.filter(id => {
      return channelIDs.indexOf(+id) === -1;
    })
    return Object.assign({}, state, {
      loadingChannels: remainingChannels
    })
  }
  return state;
}

function dbDeleteReceived(state: State, action: DBActions.DeleteReceivedAction) {
  if (action.payload && action.payload.model === fromDB.models.genotypingProject) {
    return initialState;
  }
  return state;
}

function activateGenotypingProjectPath(state: State, action: NavigationActions.ActivateGenotypingProjectPathAction) {
  return Object.assign({}, state, {
    appState: 'list',
    activeGenotypingProjectID: null,
    activeSampleID: null,
    activeSampleGenotypeID: null,
    genotypeFilter: {
      locus: 1,
      sample_barcode_regex: null,
      genotype_flag: 'any',
      crosstalk_limit: null,
      bleedthrough_limit: null,
      min_allele_count: null,
      max_allele_count: null,
      min_main_peak_height: null,
      max_main_peak_height: null
    },
    activeGenotypeID: null,
    loadingChannels: [],
    showNonReferenceRuns: false
  })
}

function loadingGenotypingProjects(state: State, action: GenotypingProjectActions.LoadingGenotypingProjectsAction) {
  return Object.assign({}, state, {
    loadingGenotypingProjects: true
  });
}

function activateGenotypingProject(state: State, action: GenotypingProjectActions.ActivateGenotypingProjectAction | GenotypingProjectActions.LoadingGenotypingProjectAction) {
  return Object.assign({}, state, {
    activeGenotypingProjectID: action.payload,
    activeSampleID: null,
    appState: 'details',
    genotypeFilter: {
      locus: null,
      sample_barcode_regex: null,
      genotype_flag: 'any',
      crosstalk_limit: null,
      bleedthrough_limit: null,
      min_allele_count: null,
      max_allele_count: null,
      min_main_peak_height: null,
      max_main_peak_height: null
    },
    activeGenotypeID: null,
    loadingChannels: []
  });
}

function deactivateGenotypingProject(state: State, action: GenotypingProjectActions.DeactivateGenotypingProjectAction) {
  return Object.assign({}, state, {
    appState: 'list',
    activeGenotypingProjectID: null,
    activeSampleID: null,
    genotypeFilter: {
      locus: null,
      sample_barcode_regex: null,
      genotype_flag: 'any',
      crosstalk_limit: null,
      bleedthrough_limit: null,
      min_allele_count: null,
      max_allele_count: null,
      min_main_peak_height: null,
      max_main_peak_height: null
    },
    activeGenotypeID: null,
    loadingChannels: []
  })
}

function setDetailTab(state: State, action: GenotypingProjectActions.SetDetailTabAction) {
  switch (action.payload) {
    case 'genotypes_viewer':
      return Object.assign({}, state, {
        detailsState: 'genotypes_viewer',
        activeSampleID: null,
        activeGenotypeID: null,
        showNonReferenceRuns: false
      });
    case 'genotypes_editor':
      return Object.assign({}, state, {
        detailsState: 'genotypes_editor',
        activeSampleID: null,
        activeGenotypeID: null,
        showNonReferenceRuns: false,
      });
    default:
      return Object.assign({}, state, {
        detailsState: null
      })
  }
}

function applyGenotypeFilter(state: State, action: GenotypingProjectActions.ApplyGenotypeFilterAction) {
  return Object.assign({}, state, {
    genotypeFilter: action.payload,
    activeGenotypeID: null
  })
}

function clearGenotypeFilter(state: State, action: GenotypingProjectActions.ClearGenotypeFilterAction) {
  return Object.assign({}, state, {
    genotypeFilter: {
      locus: null,
      sample_barcode_regex: null,
      genotype_flag: 'any',
      crosstalk_limit: null,
      bleedthrough_limit: null,
      min_allele_count: null,
      max_allele_count: null,
      min_main_peak_height: null,
      max_main_peak_height: null
    },
    activeGenotypeID: null,
    loadingChannels: []
  })
}

function activateGenotype(state: State, action: GenotypingProjectActions.ActivateGenotypeAction) {
  return Object.assign({}, state, {
    activeGenotypeID: action.payload,
  })
}

function loadingChannels(state: State, action: GenotypingProjectActions.LoadingChannelsAction) {
  const remainingIDs = Array.from(new Set(action.payload.concat(state.loadingChannels)));
  // const remainingChannels = state.loadingChannels.filter(id => +id !== +loadingID)
  return Object.assign({}, state, {
    loadingChannels: remainingIDs
  })
}

function toggleShowNonReferenceRuns(state: State, action: GenotypingProjectActions.ToggleShowNonReferenceRunsAction) {
  return Object.assign({}, state, {
    showNonReferenceRuns: !state.showNonReferenceRuns
  })
}

function selectSample(state: State, action: GenotypingProjectActions.SelectSampleAction) {
  return Object.assign({}, state, {
    activeSampleID: action.payload,
    activeGenotypeID: null,
  })
}


export const selectGenotypingProjectState = createFeatureSelector<State>('genotypingProjects');
export const selectAppState = createSelector(selectGenotypingProjectState, (state: State) => state.appState);
export const selectLoadingGenotypingProjects = createSelector(selectGenotypingProjectState, (state: State) => state.loadingGenotypingProjects);
export const selectGenotypingProjectsLoaded = createSelector(selectGenotypingProjectState, (state: State) => state.genotypingProjectsLoaded);
export const selectActiveGenotypingProjectID = createSelector(selectGenotypingProjectState, (state: State) => state.activeGenotypingProjectID);
export const selectActiveSampleID = createSelector(selectGenotypingProjectState, (state: State) => state.activeSampleID)
export const selectGenotypeFilter = createSelector(selectGenotypingProjectState, (state: State) => state.genotypeFilter);
export const selectActiveGenotypeID = createSelector(selectGenotypingProjectState, (state: State) => state.activeGenotypeID);
export const selectLoadingChannels = createSelector(selectGenotypingProjectState, (state: State) => state.loadingChannels);
export const selectShowNonReferenceRuns = createSelector(selectGenotypingProjectState, (state: State) => state.showNonReferenceRuns);
export const selectDetailsState = createSelector(selectGenotypingProjectState, (state: State) => state.detailsState);

export const selectActiveGenotypingProject = createSelector(
  fromDB.selectGenotypingProjectEntities,
  selectActiveGenotypingProjectID,
  (entities, id): GenotypingProject => entities[id]
);

export const selectActiveLocusSet = createSelector(fromDB.selectLocusSetEntities, selectActiveGenotypingProject, (locusSets, genotypingProject): LocusSet => {
  if (locusSets && genotypingProject) {
    return locusSets[genotypingProject.locus_set];
  } else {
    return null;
  }
});

export const selectActiveBinEstimator = createSelector(
  fromDB.selectBinEstimatorProjectEntities,
  selectActiveGenotypingProject,
  (entities, gp): BinEstimatorProject => (entities && gp) ? entities[gp.bin_estimator] : null
)

export const selectActiveArtifactEstimator = createSelector(
  fromDB.selectArtifactEstimatorProjectEntities,
  selectActiveGenotypingProject,
  (entities, gp): ArtifactEstimatorProject => (entities && gp) ? entities[gp.artifact_estimator] : null
)

export const selectActiveQuantificationBiasEstimator = createSelector(
  fromDB.selectQuantificationBiasEstimatorProjectEntities,
  selectActiveGenotypingProject,
  (entities, gp): QuantificationBiasEstimatorProject => (entities && gp) ? entities[gp.quantification_bias_estimator] : null
)

export const selectActiveSamples = createSelector(
  selectActiveGenotypingProject,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities, (project, psaMap, sampleMap): Sample[] => {
    if (!project || !project.detailed) {
      return [];
    }

    return project.sample_annotations.map(id => {
      const annotation: ProjectSampleAnnotations = psaMap[id];
      if (annotation) {
        return sampleMap[annotation.sample as string];
      } else {
        return null
      }
    }).filter(e => e != null);
  }
)

export const selectInactiveSamples = createSelector(
  selectActiveGenotypingProject,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities, (project, psaMap, sampleMap): Sample[] => {
    if (!project || !project.detailed) {
      return [];
    }

    const inactiveSamples = Object.assign({}, sampleMap);
    let annotation: ProjectSampleAnnotations;

    project.sample_annotations.forEach(id => {
      annotation = psaMap[id];
      if (annotation) {
        delete inactiveSamples[annotation.sample as string];
      }
    });

    return Object.keys(inactiveSamples).map(id => inactiveSamples[id]);
  }
);

export const selectActiveLoci = createSelector(selectActiveLocusSet, fromDB.selectLocusEntities, (locusSet, loci) => {
  if (locusSet) {
    return locusSet.loci.map(id => loci[id]);
  } else {
    return [];
  }
});

export const selectActiveGenotypes = createSelector(
  selectActiveGenotypingProjectID,
  fromDB.selectGenotypeList,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities,
  fromDB.selectLocusEntities,
  (project: string | number, genotypes: Genotype[], projectSampleAnnotations: EntityMap<ProjectSampleAnnotations>, samples: EntityMap<Sample>, loci: EntityMap<Locus>) => {
  return genotypes
    .filter(genotype => +genotype.project === +project)
    .map(genotype => {
      if (!genotype) {
        return null;
      }

      const sampleAnnotations = projectSampleAnnotations[genotype.sample_annotations as string];
      if (!sampleAnnotations) {
        return null;
      }

      const sample = samples[sampleAnnotations.sample as string];
      const locus = loci[genotype.locus as string];
      return Object.assign({}, genotype, {
        sample_annotations: Object.assign({}, sampleAnnotations, {
          sample: sample
        }),
        locus: locus
      });
    }).filter(g => g);
});

export const selectActiveGenotype = createSelector(
  selectActiveGenotypeID,
  fromDB.selectGenotypeEntities,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities,
  fromDB.selectLocusEntities,
  (genotypeID: string | number, genotypes: EntityMap<Genotype>, projectSampleAnnotations: EntityMap<ProjectSampleAnnotations>, samples: EntityMap<Sample>, loci: EntityMap<Locus>) => {
    const genotype = genotypes[genotypeID]
    if (genotype) {
      const sampleAnnotations = projectSampleAnnotations[genotype.sample_annotations as string];
      const sample = samples[sampleAnnotations.sample as string];
      const locus = loci[genotype.locus as string];
      if (!sampleAnnotations || !sample) {
        return null;
      }
      return Object.assign({}, genotype, {
        sample_annotations: Object.assign({}, sampleAnnotations, {
          sample: sample
        }),
        locus: locus
      })
    } else {
      return null;
    }
  }
)

export const selectActiveSample = createSelector(selectActiveSampleID, fromDB.selectSampleEntities, (id, samples: EntityMap<Sample>) => samples[id]);

export const selectActiveSampleGenotypes = createSelector(
  selectActiveGenotypes,
  selectActiveSampleID,
  selectDetailsState,
  (genotypes: Genotype[], sampleID: string | number, detailsState) => {
    if (!sampleID || detailsState === 'genotypes_editor') {
      return [];
    }
    const activeGenotypes = genotypes.filter(g => {
      const sampleAnnotations = g.sample_annotations as ProjectSampleAnnotations;
      const sample = sampleAnnotations.sample as Sample;
      return sample.id === sampleID;
    })

    return activeGenotypes;
  }
)

export const selectActiveLocusParameters = createSelector(
  selectActiveGenotypingProject,
  fromDB.selectGenotypingLocusParamsEntities,
  fromDB.selectLocusEntities,
  (project, locusParams, loci) => {
    if (project && locusParams && loci) {
      return project.locus_parameters.map(id => {
        const locusParam = locusParams[id];
        if (locusParam) {
          return Object.assign({}, locusParam, {locus: loci[locusParam.locus]});
        } else {
          return null;
        }
      }).filter(e => e != null)
    } else {
      return [];
    }
});

export const selectFilteredGenotypes = createSelector(
  selectActiveGenotypes,
  selectGenotypeFilter,
  selectDetailsState,
  (genotypes, genotypeFilter, detailsState) => {
    if (genotypeFilter.locus == null || detailsState === 'genoypes_viewer') {
      return [];
    } else {
      const min_main_peak_height = genotypeFilter.min_main_peak_height == null ? Number.MIN_SAFE_INTEGER : genotypeFilter.min_main_peak_height;
      const max_main_peak_height = genotypeFilter.max_main_peak_height == null ? Number.MAX_SAFE_INTEGER : genotypeFilter.max_main_peak_height;
      const bleedthrough_limit = genotypeFilter.bleedthrough_limit == null ? Number.MIN_SAFE_INTEGER : genotypeFilter.bleedthrough_limit;
      const crosstalk_limit = genotypeFilter.crosstalk_limit == null ? Number.MIN_SAFE_INTEGER : genotypeFilter.crosstalk_limit;
      const min_allele_count = genotypeFilter.min_allele_count == null ? Number.MIN_SAFE_INTEGER : genotypeFilter.min_allele_count;
      const max_allele_count = genotypeFilter.max_allele_count == null ? Number.MAX_SAFE_INTEGER : genotypeFilter.max_allele_count;

      let filteredGenotypes = genotypes.filter(genotype => {
        const peaks: GenotypePeak[] = genotype.annotated_peaks;

        if (+genotype.locus.id !== +genotypeFilter.locus) {
          return false;
        }

        if (genotypeFilter.sample_barcode_regex) {
          const sampleRegex = RegExp(genotypeFilter.sample_barcode_regex, 'i');
          const match = genotype.sample_annotations.sample.barcode.match(sampleRegex);
          if (match == null) {
            return false;
          }
        }

        switch (genotypeFilter.genotype_flag) {
          case 'all':
            return true;

          case 'failure':
            return genotype.flags.failure;

          case 'offscale':
            return genotype.flags.offscale;

          case 'out_of_bin':
            return peaks.some(p => !p.in_bin && !p.flags.artifact)
        }
      })

      filteredGenotypes = filteredGenotypes.filter(genotype => {
        const peaks: GenotypePeak[] = genotype.annotated_peaks;

        const totalAlleles = Object.values(genotype.alleles).reduce((a: boolean, b: boolean) => +a + +b, 0);

        if (!(min_allele_count <= totalAlleles && totalAlleles <= max_allele_count)) {
          return false;
        }

        const mainPeak = peaks.reduce((prev, next) => {
          return next.peak_height > prev.peak_height ? next : prev;
        }, {peak_height: Number.MIN_SAFE_INTEGER});

        if (!(min_main_peak_height <= mainPeak.peak_height && mainPeak.peak_height <= max_main_peak_height)) {
          return false;
        }

        const maxBleedthroughPeak = peaks.filter(p => p.in_bin).reduce((prev, next) => {
          return next.bleedthrough_ratio > prev.bleedthrough_ratio ? next : prev;
        }, {bleedthrough_ratio: Number.MIN_SAFE_INTEGER});

        if (maxBleedthroughPeak.bleedthrough_ratio <= bleedthrough_limit) {
          return false;
        }

        const maxCrosstalkPeak = peaks.filter(p => p.in_bin).reduce((prev, next) => {
          return next.crosstalk_ratio > prev.crosstalk_ratio ? next : prev;
        }, {crosstalk_ratio: Number.MIN_SAFE_INTEGER});

        if (maxCrosstalkPeak.crosstalk_ratio <= crosstalk_limit) {
          return false;
        }

        return true;

      })
      return filteredGenotypes;
    }
  }
)

export const selectActiveGenotypeChannelIDs = createSelector(selectActiveGenotype, (genotype) => {
  if (genotype) {
    return genotype.sample_annotations.sample.channels;
  } else {
    return [];
  }
})

export const selectActiveGenotypeChannels = createSelector(selectActiveGenotypeChannelIDs, fromDB.selectChannelEntities, (ids, channelEntities) => {
  return ids.map(id => channelEntities[id]);
});

export const selectReferenceTrace = createSelector(
  selectActiveGenotype,
  fromDB.selectProjectChannelAnnotationsEntities,
  fromDB.selectChannelEntities,
  fromDB.selectWellEntities,
  (genotype: Genotype, projectChannelAnnotationEntities: EntityMap<ProjectChannelAnnotations>, channelEntities: EntityMap<Channel>, wellEntities: EntityMap<Well>): Trace => {
    if (!genotype || Object.keys(genotype.alleles).length === 0) {
      return null;
    }
    const projectChannelAnnotation = projectChannelAnnotationEntities[genotype.reference_run];
    const channel = channelEntities[projectChannelAnnotation.channel];

    if (!channel || !channel.detailed) {
      return null;
    }

    const well = wellEntities[channel.well];

    if (!well || !well.detailed) {
      return null;
    }

    const data = <[number, number][]> d3.zip(well.base_sizes, channel.data);
    return {
      id: +channel.id,
      data: data,
      color: COLORMAP['green']
    }
})

export const selectReferencePeakAnnotations = createSelector(selectActiveGenotype, (genotype): Circle[] => {
  if (!genotype) {
    return [];
  }

  return genotype.annotated_peaks.map(peak => {
    let peakColor = 'blue';
    if (peak.flags.artifact) {
      peakColor = 'yellow';
    } else if (!peak.in_bin) {
      peakColor = 'red';
    } else if (peak.flags.bleedthrough || peak.flags.crosstalk) {
      peakColor = 'green';
    }

    const peakAnnotation =
      `RELATIVE HEIGHT: ${peak.relative_peak_height.toFixed(2)}\n` +
      `HEIGHT: ${peak.peak_height}\n` +
      `SIZE: ${peak.peak_size.toFixed(2)}\n` +
      `BLEEDTHROUGH: ${peak.bleedthrough_ratio.toFixed(2)}\n` +
      `CROSSTALK: ${peak.crosstalk_ratio.toFixed(2)}\n` +
      (peak.bin ? `BIN: ${peak.bin}\n` : '') +
      (peak.artifact_contribution ? `ARTIFACT: ${peak.artifact_contribution.toFixed(2)}\n` : '') +
      (peak.artifact_error ? `ERROR: ${peak.artifact_error.toFixed(2)}\n` : '') +
      (peak.probability ? `PROBABILITY: ${peak.probability.toFixed(2)}` : '')

    return {
      center: [peak.peak_size, peak.peak_height] as [number, number],
      radius: 4,
      color: peakColor,
      opacity: 1,
      peakAnnotation: peakAnnotation
    }
  })
})

export const selectFilteredChannels = createSelector(
  selectActiveGenotype,
  fromDB.selectProjectChannelAnnotationsEntities,
  fromDB.selectChannelEntities,
  (genotype: Genotype, projectChannelAnnotationEntities: EntityMap<ProjectChannelAnnotations>, channelEntities: EntityMap<Channel>): Channel[] => {
    if (!genotype) {
      return [];
    }

    const sampleAnnotations = genotype.sample_annotations as ProjectSampleAnnotations;
    const sample = sampleAnnotations.sample as Sample;
    const locus = genotype.locus as Locus;
    const projectChannelAnnotation = projectChannelAnnotationEntities[genotype.reference_run];
    const channels = sample.channels.map(id => channelEntities[id]).filter(channel => channel.locus == locus.id);
    return channels;
  }
)

export const selectNonReferenceTraces = createSelector(
  selectActiveGenotype,
  fromDB.selectProjectChannelAnnotationsEntities,
  fromDB.selectChannelEntities,
  fromDB.selectWellEntities,
  selectShowNonReferenceRuns,
  (genotype: Genotype, projectChannelAnnotationEntities: EntityMap<ProjectChannelAnnotations>, channelEntities: EntityMap<Channel>, wellEntities: EntityMap<Well>, showRuns: boolean): Trace[] => {
    if (!genotype || !showRuns) {
      return [];
    }

    const sampleAnnotations = genotype.sample_annotations as ProjectSampleAnnotations;
    const sample = sampleAnnotations.sample as Sample;
    const locus = genotype.locus as Locus;
    const projectChannelAnnotation = projectChannelAnnotationEntities[genotype.reference_run];
    const channels = sample.channels.filter(id => id !== projectChannelAnnotation.channel).map(id => channelEntities[id]);
    const traces = channels.filter(c => +c.locus === +locus.id).map(c => {
      if (!c || !c.detailed) {
        return null;
      }

      const well = wellEntities[c.well];

      if (!well || !well.detailed || well.sizing_quality > 999) {
        return null;
      }

      const data = <[number, number][]> d3.zip(well.base_sizes, c.data);
      return {
        id: +c.id,
        data: data,
        color: COLORMAP['green'],
      }
    }).filter(t => t);
    return traces;
  })

export const selectAlleleDisplay = createSelector(selectActiveGenotype, fromDB.selectBinEntities, (genotype, binEntities) => {
  if (!genotype) {
    return [];
  }

  const bins: Bar[] = Object.keys(genotype.alleles).map(id => binEntities[id]).map(b => {
    return {
      id: +b.id,
      color: genotype.alleles[b.id] ? '#C96310' : '#4292D1',
      opacity: .65,
      center: b.base_size,
      halfWidth: b.bin_buffer
    }
  });

  return bins;
})

export const selectReferenceRunDisplay = createSelector(
  selectActiveGenotype,
  selectAlleleDisplay,
  selectReferenceTrace,
  selectReferencePeakAnnotations,
  (genotype: Genotype, alleles: Bar[], referenceRun: Trace, peaks: Circle[]): TraceDisplay => {
    if (!genotype) {
      return null;
    }

    if (!referenceRun) {
      return null;
    }

    const locus = genotype.locus as Locus;
    const domain = [locus.min_base_length * .9, locus.max_base_length * 1.1];
    let range = referenceRun.data.reduce((prev, next) => {
      let [min, max] = prev;
      const peak_size = next[1];
      const base_size = next[0];
      if (base_size >= domain[0] && base_size <= domain[1]) {
        if (peak_size < min) {
          min = peak_size;
        } else if (peak_size > max) {
          max = peak_size;
        }
      }
      return [min, max];
    }, [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]);
    range = [range[0] * .9, range[1] * 1.1];
    return {
      domain: domain as [number, number],
      range: range,
      trace: referenceRun,
      bins: alleles,
      peakAnnotations: peaks
    }
})

export const selectNonReferenceRunDisplays = createSelector(
  selectActiveGenotype,
  selectAlleleDisplay,
  selectNonReferenceTraces,
  selectShowNonReferenceRuns,
  (genotype: Genotype, alleles: Bar[], nonReferenceRuns: Trace[], showRuns: boolean) => {
    if (!genotype || !showRuns) {
      return [];
    }

    if (nonReferenceRuns.length === 0) {
      return [];
    }

    const locus = genotype.locus as Locus;
    const domain = [locus.min_base_length * .9, locus.max_base_length * 1.1];

    return nonReferenceRuns.map(run => {
      if (run == null) {
        return null;
      }

      let range = run.data.reduce((prev, next) => {
        let [min, max] = prev;
        const peak_size = next[1];
        const base_size = next[0];
        if (base_size >= domain[0] && base_size <= domain[1]) {
          if (peak_size < min) {
            min = peak_size;
          } else if (peak_size > max) {
            max = peak_size;
          }
        }
        return [min, max];
      }, [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]);

      range = [range[0] * .9, range[1] * 1.1];
      return {
        domain: domain as [number, number],
        range: range,
        trace: run,
        bins: alleles
      }
    })
  }
)


export const selectGenotypeIsLoading = createSelector(selectActiveGenotype, selectLoadingChannels, (genotype, channelIDs) => {
  channelIDs = channelIDs.map(id => +id);

  if (!genotype || channelIDs.length === 0) {
    return false;
  }

  genotype.sample_annotations.sample.channels.forEach(id => {
    if (channelIDs.indexOf(+id) !== -1) {
      return true;
    }
  })

  return false;
})

