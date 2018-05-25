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
import { WellService } from 'app/services/ce/well';
import { PlateService } from 'app/services/ce/plate';
import { LadderService } from 'app/services/ce/ladder';

import * as fromArtifactEquation from 'app/reducers/db/artifact-estimator/artifact-equation';
import * as fromArtifactEstimator from 'app/reducers/db/artifact-estimator/artifact-estimator';
import * as fromLocusArtifactEstimator from 'app/reducers/db/artifact-estimator/locus-artifact-estimator';
import * as fromArtifactEstimatorLocusParams from 'app/reducers/db/artifact-estimator/locus-params';
import * as fromArtifactEstimatorProject from 'app/reducers/db/artifact-estimator/project';
import * as fromBin from 'app/reducers/db/bin-estimator/bin';
import * as fromLocusBinSet from 'app/reducers/db/bin-estimator/locus-bin-set';
import * as fromBinEstimatorLocusParams from 'app/reducers/db/bin-estimator/locus-params';
import * as fromBinEstimatorProject from 'app/reducers/db/bin-estimator/project';
import * as fromGenotypingLocusParams from 'app/reducers/db/genotyping/locus-params';
import * as fromGenotypingProject from 'app/reducers/db/genotyping/project';
import * as fromLocusSet from 'app/reducers/db/locus/locus-set';
import * as fromLocus from 'app/reducers/db/locus/locus';
import * as fromProjectChannelAnnotations from 'app/reducers/db/project/channel-annotations';
import * as fromProjectSampleAnnotations from 'app/reducers/db/project/sample-annotations';
import * as fromQuantificationBiasEstimatorLocusParams from 'app/reducers/db/quantification-bias-estimator/locus-params';
import * as fromQuantificationBiasEstimatorProject from 'app/reducers/db/quantification-bias-estimator/project';
import * as fromControlSampleAssociation from 'app/reducers/db/sample/control-sample-association';
import * as fromControl from 'app/reducers/db/sample/control';
import * as fromGenotype from 'app/reducers/db/sample/genotype';
import * as fromSampleLocusAnnotation from 'app/reducers/db/sample/sample-locus-annotation';
import * as fromSample from 'app/reducers/db/sample/sample';
import * as fromChannel from 'app/reducers/db/ce/channel';
import * as fromWell from 'app/reducers/db/ce/well';
import * as fromPlate from 'app/reducers/db/ce/plate';
import * as fromLadder from 'app/reducers/db/ce/ladder';


export const modelToService = {
  [fromArtifactEquation.MODEL]: ArtifactEquationService,
  [fromArtifactEstimator.MODEL]: ArtifactEstimatorService,
  [fromLocusArtifactEstimator.MODEL]: LocusArtifactEstimatorService,
  [fromArtifactEstimatorLocusParams.MODEL]: ArtifactEstimatorLocusParamsService,
  [fromArtifactEstimatorProject.MODEL]: ArtifactEstimatorProjectService,
  [fromBin.MODEL]: BinService,
  [fromLocusBinSet.MODEL]: LocusBinSetService,
  [fromBinEstimatorLocusParams.MODEL]: BinEstimatorLocusParamsService,
  [fromBinEstimatorProject.MODEL]: BinEstimatorProjectService,
  [fromGenotypingLocusParams.MODEL]: GenotypingLocusParamsService,
  [fromGenotypingProject.MODEL]: GenotypingProjectService,
  [fromLocusSet.MODEL]: LocusSetService,
  [fromLocus.MODEL]: LocusService,
  [fromProjectChannelAnnotations.MODEL]: ProjectChannelAnnotationsService,
  [fromProjectSampleAnnotations.MODEL]: ProjectSampleAnnotationsService,
  [fromQuantificationBiasEstimatorLocusParams.MODEL]: QuantificationBiasEstimatorLocusParamsService,
  [fromQuantificationBiasEstimatorProject.MODEL]: QuantificationBiasEstimatorProjectService,
  [fromControlSampleAssociation.MODEL]: ControlSampleAssociationService,
  [fromControl.MODEL]: ControlService,
  [fromGenotype.MODEL]: GenotypeService,
  [fromSampleLocusAnnotation.MODEL]: SampleLocusAnnotationService,
  [fromSample.MODEL]: SampleService,
  [fromChannel.MODEL]: ChannelService,
  [fromWell.MODEL]: WellService,
  [fromPlate.MODEL]: PlateService,
  [fromLadder.MODEL]: LadderService,
}
