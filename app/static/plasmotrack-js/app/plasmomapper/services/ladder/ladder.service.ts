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

import { Ladder }               from './ladder.model';

@Injectable()
export class LadderService {
    public getLadders: () => Observable<Ladder[]>;
    public getLadder: (id: number) => Observable<Ladder>;
    public updateLadder: (ladder: Ladder) => Observable<Ladder>;
    public createLadder: (ladder: Ladder) => Observable<Ladder>;
    
    private _ladderUrl = API_BASE + '/ladder/';
    private _ladderCache = new LRUCache<Ladder>();
    
    constructor (private _commonServerMethods: CommonServerMethods) {
        this.getLadders = () => this._commonServerMethods.getList(Ladder, this._ladderUrl);
        this.getLadder = (id: number) => this._commonServerMethods.getDetails(id, Ladder, this._ladderUrl, this._ladderCache);
        this.updateLadder = (ladder: Ladder) => this._commonServerMethods.updateItem(ladder, Ladder, this._ladderUrl, this._ladderCache);
        this.createLadder = (ladder: Ladder) => this._commonServerMethods.createItem(ladder, Ladder, this._ladderUrl, this._ladderCache);
    }
}