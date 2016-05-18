import { Injectable }           from '@angular/core';
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { Sample }               from './sample.model';

@Injectable()
export class SampleService {
    public getSamples: () => Observable<Sample[]>
    public getSample: (id: number) => Observable<Sample>
    public postSamples: (files: File[]) => Observable<Sample[]>
    
    private _samplesUrl = API_BASE + '/sample/';
    private _sampleCache = new LRUCache<Sample>();
    
    constructor(private _commonServerMethods: CommonServerMethods) {
        this.getSamples = () => this._commonServerMethods.getList(Sample, this._samplesUrl);
        this.getSample = (id: number) => this._commonServerMethods.getDetails(id, Sample, this._samplesUrl, this._sampleCache);
        
        this.postSamples = (files: File[]) => {
            return this._commonServerMethods.postFiles(files, this._samplesUrl, {})
                .map(samples => {
                    console.log(samples);
                    let sample_array = [];
                    for(let i = 0; i < samples.length; i++) {
                        let t = new Sample();
                        t.fillFromJSON(samples[i]);
                        sample_array.push(t);
                        this._sampleCache.set(t.id, t);
                    }
                    return sample_array
                })
        }
    }
}