// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { Injectable }           from '@angular/core';
import { API_BASE }             from '../../../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../../../utils/LRUCache';
import { CommonServerMethods }  from '../../../utils/ServerMethods';

import { DatabaseItem }             from '../../../DatabaseItem';

import { ArtifactEquationParameterSet } from './artifact-equation/artifact-equation-parameter-set.model';

@Injectable()
export class ArtifactEstimatorService {
    private _artifactEstimatorUrl = API_BASE + "/artifact-estimator-equation/";
}