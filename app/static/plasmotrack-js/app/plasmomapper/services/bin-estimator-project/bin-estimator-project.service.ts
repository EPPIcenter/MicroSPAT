import { Injectable }           from '@angular/core';
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { ProjectService }       from '../project/project.service';

import { DatabaseItem }         from '../DatabaseItem';
import { BinEstimatorProject }  from './bin-estimator-project.model';

@Injectable()
export class BinEstimatorProjectService extends ProjectService {
    public getBinEstimatorProjects: () => Observable<BinEstimatorProject[]>
    public getBinEstimatorProject: (id: number) => Observable<BinEstimatorProject>
    public updateBinEstimatorProject: (project: BinEstimatorProject) => Observable<BinEstimatorProject>
    public createBinEstimatorProject: (project: BinEstimatorProject) => Observable<BinEstimatorProject>
    public deleteBinEstimatorProject: (id: number) => Observable<DatabaseItem>
    public clearCache: (id: number) => void;
    
    private _binEstimatorProjectsUrl = API_BASE + '/bin-estimator/';
    private _binEstimatorProjectsCache = new LRUCache<BinEstimatorProject>(100);
    
    constructor(protected _commonServerMethods: CommonServerMethods) {
        super(_commonServerMethods);
        this.getBinEstimatorProjects = () => this._commonServerMethods.getList(BinEstimatorProject, this._binEstimatorProjectsUrl);
        this.getBinEstimatorProject = (id: number) => this._commonServerMethods.getDetails(id, BinEstimatorProject, this._binEstimatorProjectsUrl, this._binEstimatorProjectsCache);
        this.updateBinEstimatorProject = (project: BinEstimatorProject) => this._commonServerMethods.updateItem(project, BinEstimatorProject, this._binEstimatorProjectsUrl, this._binEstimatorProjectsCache);
        this.createBinEstimatorProject = (project: BinEstimatorProject) => this._commonServerMethods.createItem(project, BinEstimatorProject, this._binEstimatorProjectsUrl, this._binEstimatorProjectsCache);
        this.deleteBinEstimatorProject = (id: number) => this._commonServerMethods.deleteItem(id, this._binEstimatorProjectsUrl, this._binEstimatorProjectsCache);
        this.clearCache = (id: number) => this._binEstimatorProjectsCache.remove(id);       
    }
}