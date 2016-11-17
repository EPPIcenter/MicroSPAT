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

import { Injectable }               from '@angular/core';
import { Http, Response }           from '@angular/http';
import { API_BASE }                 from '../../api';

import { Observable }               from 'rxjs/Observable';

import { LRUCache }                 from '../utils/LRUCache';
import { CommonServerMethods }      from '../utils/ServerMethods';

import { ProjectService }           from '../project/project.service';

import { DatabaseItem }             from '../DatabaseItem';
import { SampleLocusAnnotation }    from './sample-annotation/locus-annotation/sample-locus-annotation.model';
import { ChannelAnnotation }        from '../project/channel-annotation/channel-annotation.model';

@Injectable()
export class SampleBasedProjectService extends ProjectService {
    public getLocusAnnotations: (project_id: number, locus_id: number) => Observable<SampleLocusAnnotation[]>;
    public getSampleLocusAnnotations: (project_id: number, sample_id: number) => Observable<SampleLocusAnnotation[]>;
    public getSampleChannelAnnotations: (project_id: number, sample_id: number) => Observable<ChannelAnnotation[]>
    
    private _locusAnnotationUrl = API_BASE + '/locus-annotations/';
        
    constructor (protected _commonServerMethods: CommonServerMethods) {
        super(_commonServerMethods);
        this.getLocusAnnotations = (project_id: number, locus_id: number) => {
            let url = this._locusAnnotationUrl + project_id + "/locus/" + locus_id + "/";
            return this._commonServerMethods.getList(SampleLocusAnnotation, url)
        };
        
        this.getSampleLocusAnnotations = (project_id: number, sample_id: number) => {
            console.log("Getting Sample Locus Annotations");
            
            let url = this._locusAnnotationUrl + project_id + "/sample/" + sample_id + "/";
            return this._commonServerMethods.getList(SampleLocusAnnotation, url)
        };
        
        this.getSampleChannelAnnotations = (project_id: number, sample_id: number) => {
            console.log("Getting Sample Channel Annotations");
            
            let url = this._channelAnnotationsUrl + project_id + "/sample/" + sample_id;
            return this._commonServerMethods.getList(ChannelAnnotation, url)
        }
    }
}