import { Injectable }           from '@angular/core';
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { Plate }                from './plate.model';

@Injectable()
export class PlateService {
    public getPlates: () => Observable<Plate[]>
    public getPlate: (id: number) => Observable<Plate>
    public clearPlateFromCache: (id: number) => void
    public postPlates: (files: File[], params: Object) => Observable<Plate[]>
    public postPlateMap: (files: File[], id: number) => Observable<Plate>
    
    private _platesUrl = API_BASE + '/plate/';
    private _plateCache = new LRUCache<Plate>(100);
    
    constructor(private _commonServerMethods: CommonServerMethods) {
        this.getPlates = () => this._commonServerMethods.getList(Plate, this._platesUrl);
        this.getPlate = (id: number) => this._commonServerMethods.getDetails(id, Plate, this._platesUrl, this._plateCache);
        this.clearPlateFromCache = (id: number) => this._plateCache.remove(id);
        this.postPlates = (files: File[], params: Object) => {
            return this._commonServerMethods.postFiles(files, this._platesUrl, params)
                .map(plates => {
                    console.log(plates);
                    let plate_array = [];
                    for(let i = 0; i < plates.length; i++){
                        let t = new Plate();
                        t.fillFromJSON(plates[i]);
                        plate_array.push(t);
                        this._plateCache.set(t.id, t);
                    }
                    return plate_array
                })
        }
        this.postPlateMap = (files: File[], id: number) => {
            return this._commonServerMethods.postFiles(files, this._platesUrl + id + "/", {})
                .map(plate => {
                    let t = new Plate();
                    t.fillFromJSON(plate);
                    this._plateCache.set(t.id, t);
                    return t;
                })
        }
    }
}