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