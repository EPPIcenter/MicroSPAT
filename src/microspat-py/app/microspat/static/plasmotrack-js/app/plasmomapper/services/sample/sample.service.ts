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