import { Injectable }           from 'angular2/core';
import { Http, Response }       from 'angular2/http';
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