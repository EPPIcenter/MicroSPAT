import { Injectable }           from 'angular2/core';
import { API_BASE }             from '../../../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../../../utils/LRUCache';
import { CommonServerMethods }  from '../../../utils/ServerMethods';

import { DatabaseItem }             from '../../../DatabaseItem';

import { ArtifactEquationParameterSet } from './artifact-equation/artifact-equation-parameter-set.model';

@Injectable()
export class ArtifactEstimatorService {
    private _artifactEstimatorUrl = API_BASE + "/artifact-estimator-equation/"
}