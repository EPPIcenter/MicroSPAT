import { Injectable }           from '@angular/core';
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { DatabaseItem }         from '../DatabaseItem';
import { Locus }                from './locus.model';


@Injectable()
export class LocusService {
    public getLoci: () => Observable<Locus[]>;
    public getLocus: (id: number) => Observable<Locus>;
    public updateLocus: (locus: Locus) => Observable<Locus>;
    public createLocus: (locus: Locus) => Observable<Locus>;
    public postLocusCSV: (file: File) => Observable<Locus[]>;
    public deleteLocus: (id: number) => Observable<any>;
    
    private _lociUrl = API_BASE + '/locus/';
    private _locusCache = new LRUCache<Locus>();
    
    constructor (private _commonServerMethods: CommonServerMethods) {
        this.getLoci = () => this._commonServerMethods.getList(Locus, this._lociUrl);
        
        this.getLocus = (id: number) => this._commonServerMethods.getDetails(id, Locus, this._lociUrl, this._locusCache);
        
        this.updateLocus = (locus: Locus) => this._commonServerMethods.updateItem(locus, Locus, this._lociUrl, this._locusCache);
        
        this.createLocus = (locus: Locus) => this._commonServerMethods.createItem(locus, Locus, this._lociUrl, this._locusCache);

        this.postLocusCSV = (file: File) => this._commonServerMethods.postFiles([file], this._lociUrl + "from-csv/", {})
            .map(loci => {
                return loci.map(locusObj => {
                    let l = new Locus();
                    l.fillFromJSON(locusObj);
                    return l
                })
            });

        this.deleteLocus = (id: number) => this._commonServerMethods.deleteItem(id, this._lociUrl, this._locusCache);
    }
}