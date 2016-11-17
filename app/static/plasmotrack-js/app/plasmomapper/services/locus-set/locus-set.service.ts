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

import { LocusSet }             from './locus-set.model';

@Injectable()
export class LocusSetService {
    public getLocusSets: () => Observable<LocusSet[]>;
    public getLocusSet: (id: number) => Observable<LocusSet>;
    public createLocusSet: (locus_set: LocusSet, locus_ids: number[]) => Observable<LocusSet>;
    public deleteLocusSet: (id: number) => Observable<any>;
    
    private _locusSetUrl = API_BASE + '/locus-set/';
    private _locusSetCache = new LRUCache<LocusSet>(100);
    
    constructor (private _commonServerMethods: CommonServerMethods) {
        this.getLocusSets = () => this._commonServerMethods.getList(LocusSet, this._locusSetUrl);
        this.getLocusSet = (id: number) => this._commonServerMethods.getDetails(id, LocusSet, this._locusSetUrl, this._locusSetCache);
        this.createLocusSet = (locus_set: LocusSet, locus_ids: number[]) => {
            return this._commonServerMethods.createItem({locus_set: locus_set, locus_ids: locus_ids}, LocusSet, this._locusSetUrl, this._locusSetCache)
        };
        this.deleteLocusSet = (id: number) => this._commonServerMethods.deleteItem(id, this._locusSetUrl, this._locusSetCache);
    }
}