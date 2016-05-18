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
    
    private _locusParamsUrl = API_BASE + "/locus-parameters/";
    protected _channelAnnotationsUrl = API_BASE + "/channel-annotations/";
    
    constructor(protected _commonServerMethods: CommonServerMethods) {
        this.saveLocusParameters = (locus_params: LocusParameters) => {
            return this._commonServerMethods.updateItem(locus_params, LocusParameters, this._locusParamsUrl);
        }
        this.getLocusChannelAnnotations = (project_id: number, locus_id: number) => {
            let url = this._channelAnnotationsUrl + project_id + "/locus/" + locus_id; 
            return this._commonServerMethods.getList(ChannelAnnotation, url)
        }
        
    };
}