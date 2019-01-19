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
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { DatabaseItem }         from '../DatabaseItem';
import { LocusParameters }      from './locus-parameters/locus-parameters.model';
import { Project }              from './project.model';
import { ChannelAnnotation }    from './channel-annotation/channel-annotation.model';

@Injectable()
export class ProjectService {
    public saveLocusParameters: (locus_params: LocusParameters) => Observable<LocusParameters>;
    public getLocusChannelAnnotations: (project_id: number, locus_id: number) => Observable<ChannelAnnotation[]>
    public batchApplyLocusParameters: (locus_parameters: LocusParameters, project_id: number) => Observable<any>;
    
    private _locusParamsUrl = API_BASE + "/locus-parameters/";
    protected _channelAnnotationsUrl = API_BASE + "/channel-annotations/";
    
    constructor(protected _commonServerMethods: CommonServerMethods) {
        
        this.saveLocusParameters = (locus_params: LocusParameters) => {
            return this._commonServerMethods.updateItem(locus_params, LocusParameters, this._locusParamsUrl);
        };

        this.batchApplyLocusParameters = (locus_params: LocusParameters, project_id: number) => {
            locus_params['project_id'] = project_id;
            return this._commonServerMethods.postJSON(locus_params, this._locusParamsUrl);
        }

        this.getLocusChannelAnnotations = (project_id: number, locus_id: number) => {
            let url = this._channelAnnotationsUrl + project_id + "/locus/" + locus_id; 
            return this._commonServerMethods.getList(ChannelAnnotation, url)
        };
        
    };
}