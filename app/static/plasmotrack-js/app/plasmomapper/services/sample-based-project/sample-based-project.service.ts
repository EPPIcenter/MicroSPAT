import { Injectable }               from 'angular2/core';
import { Http, Response }           from 'angular2/http';
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
            let url = this._locusAnnotationUrl + project_id + "/sample/" + sample_id + "/";
            return this._commonServerMethods.getList(SampleLocusAnnotation, url)
        };
        
        this.getSampleChannelAnnotations = (project_id: number, sample_id: number) => {
            let url = this._channelAnnotationsUrl + project_id + "/sample/" + sample_id;
            return this._commonServerMethods.getList(ChannelAnnotation, url)
        }
    }
}