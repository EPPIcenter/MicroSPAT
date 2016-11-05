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

        this.testPost = () => {
            this.testPostQueue = Observable.interval(3000)
                .switchMap(() => this.http.get("https://www.random.org/sequences/?min=1&max=52&col=1&format=plain&rnd=new"))
                .subscribe(data => {
                    console.log(data);
                    this.data.push(data);
                    this.iterCount++;
                    if(this.iterCount > 3) {
                        this.testPostQueue.unsubscribe();
                    }
                })
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