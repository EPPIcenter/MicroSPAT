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

import { Observable, 
         Subscribable }         from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { Plate }                from './plate.model';

@Injectable()
export class PlateService {
    public getPlates: () => Observable<Plate[]>;
    public getPlate: (id: number) => Observable<Plate>;
    public clearPlateFromCache: (id: number) => void;
    public postPlates: (files: File[], params: Object) => Observable<Plate[]>;
    public postPlateMap: (files: File[], id: number, createSamplesIfNotExist: boolean) => Observable<Plate>;
    public deletePlate: (plate_id: number) => Observable<any>;
    public recalculateLadder: (plate_id: number, ladder_id: number) => Observable<Plate>;

    public testPost: () => void;

    public testPostQueue
    public iterCount = 0;
    public data = [];
    
    
    private _platesUrl = API_BASE + '/plate/';
    private _plateCache = new LRUCache<Plate>(100);
    
    constructor(private _commonServerMethods: CommonServerMethods, private http: Http) {
        this.getPlates = () => this._commonServerMethods.getList(Plate, this._platesUrl);
        
        this.getPlate = (id: number) => this._commonServerMethods.getDetails(id, Plate, this._platesUrl, this._plateCache);
        
        this.clearPlateFromCache = (id: number) => this._plateCache.remove(id);
        
        this.postPlates = (files: File[], params: Object) => {
            return this._commonServerMethods.postFiles(files, this._platesUrl, params)
                .map(plates => {
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
        
        this.postPlateMap = (files: File[], id: number, createSamplesIfNotExist: boolean) => {
            return this._commonServerMethods.postFiles(files, this._platesUrl + id + "/", {
                create_samples_if_not_exist: createSamplesIfNotExist
            })
                .map(plate => {
                    let t = new Plate();
                    t.fillFromJSON(plate);
                    this._plateCache.set(t.id, t);
                    return t;
                })
        }

        this.deletePlate = (plate_id: number) => {
            return this._commonServerMethods.deleteItem(plate_id, this._platesUrl, this._plateCache);
        }

        this.recalculateLadder = (plate_id: number, ladder_id: number) => {
            return this._commonServerMethods.getUrl(this._platesUrl + plate_id + "/recalculate-ladder/" + ladder_id + "/")
                .map(plate => {
                    let t = new Plate();
                    t.fillFromJSON(plate);
                    this._plateCache.set(t.id, t);
                    return t;
                })
        }
    }
}