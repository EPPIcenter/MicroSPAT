import { Injectable }           from '@angular/core';
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { NotificationService } from '../notifications/notification.service';

import { SampleBasedProjectService }       from '../sample-based-project/sample-based-project.service';

import { DatabaseItem }     from '../DatabaseItem';
import { QuantificationBiasEstimatorProject } from './quantification-bias-estimator-project.model';
import { QuantificationBiasEstimatorLocusParameters } from './locus-parameters/quantification-bias-estimator-locus-parameters.model';
import { SampleLocusAnnotation } from '../sample-based-project/sample-annotation/locus-annotation/sample-locus-annotation.model';


@Injectable()
export class QuantificationBiasEstimatorProjectService extends SampleBasedProjectService {
    public getProjects: () => Observable<QuantificationBiasEstimatorProject[]>;
    public getProject: (id: number) => Observable<QuantificationBiasEstimatorProject>;
    public updateProject: (project: QuantificationBiasEstimatorProject) => Observable<QuantificationBiasEstimatorProject>;
    public createProject: (project: QuantificationBiasEstimatorProject) => Observable<QuantificationBiasEstimatorProject>;
    public deleteProject: (id: number) => Observable<DatabaseItem>;
    public addSamples: (files: File[], id: number) => Observable<QuantificationBiasEstimatorProject>;
    
    public binEstimatorChanged: (bin_estimator_id: number) => void;

    public clearCache: (id: number) => void;

    private _projectsUrl = API_BASE + '/quantification-bias-estimator-project/';
    private _annotationsUrl = API_BASE + '/locus-annotations/';
    private _projectCache = new LRUCache<QuantificationBiasEstimatorProject>(100);

    constructor(protected _commonServerMethods: CommonServerMethods) {
        super(_commonServerMethods);

        this.getProjects = () => {
            // this._socket.emit('list');
            return this._commonServerMethods.getList(QuantificationBiasEstimatorProject, this._projectsUrl)  
        };

        this.getProject = (id: number) => {
            return this._commonServerMethods.getDetails(id, QuantificationBiasEstimatorProject, this._projectsUrl, this._projectCache);
        };
        
        this.updateProject = (project: QuantificationBiasEstimatorProject) => {
            return this._commonServerMethods.updateItem(project, QuantificationBiasEstimatorProject, this._projectsUrl, this._projectCache);
        };
        
        this.createProject = (project: QuantificationBiasEstimatorProject) => {
            if(project.id == null) {
                return this._commonServerMethods.createItem(project, QuantificationBiasEstimatorProject, this._projectsUrl, this._projectCache);
            }
        };
        
        this.deleteProject = (id: number) => {
            return this._commonServerMethods.deleteItem(id, this._projectsUrl, this._projectCache);
        };
        
        this.addSamples = (files: File[], id: number) => {
            return this._commonServerMethods.postFiles(files, this._projectsUrl + id + "/add-samples/", {})
                .map(proj => {
                    let t = new QuantificationBiasEstimatorProject();
                    t.fillFromJSON(proj);
                    this._projectCache.set(t.id, t);
                    return t;
                })
        }

        this.clearCache = (id: number) => this._projectCache.remove(id);

        this.binEstimatorChanged = (bin_estimator_id: number) => {
            let gps = [];
            
            this._projectCache.forEach((proj_id: number, proj: QuantificationBiasEstimatorProject) => {
                if(proj.bin_estimator_id === bin_estimator_id) {
                    gps.push(proj.id);
                }
            })

            gps.forEach(id => {
                this.clearCache(id);
            })
        }
    }
}