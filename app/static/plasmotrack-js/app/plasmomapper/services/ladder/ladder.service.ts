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