import { Injectable }           from '@angular/core';
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { Well }                 from './well.model';

@Injectable()
export class WellService {
    public getWell: (id: number) => Observable<Well>;
    public clearWellFromCache: (id: number) => void;
    public recalculateLadder: (id: number, peakIndices: number[]) => Observable<Response>;
    
    private _wellsUrl = API_BASE + "/well/";
    private _wellCache = new LRUCache<Well>(97);
    
    constructor(private _commonServerMethods: CommonServerMethods) {
        this.getWell = (id: number) => this._commonServerMethods.getDetails(id, Well, this._wellsUrl, this._wellCache);
        this.clearWellFromCache = (id: number) => this._wellCache.remove(id);
        this.recalculateLadder = (id: number, peakIndices: number[]) => {
            this.clearWellFromCache(id);
            let url = this._wellsUrl + id + '/recalculate-ladder/';
            return this._commonServerMethods.postJSON({'peak_indices': peakIndices}, url)
        }
    }
}