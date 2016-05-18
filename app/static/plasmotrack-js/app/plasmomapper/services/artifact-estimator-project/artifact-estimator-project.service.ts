import { Injectable }           from '@angular/core';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { ProjectService }       from '../project/project.service';

import { DatabaseItem }             from '../DatabaseItem';
import { ArtifactEstimatorProject } from './artifact-estimator-project.model';
import { ArtifactEstimator }        from './locus-artifact-estimator/artifact-estimator/artifact-estimator.model';

@Injectable()
export class ArtifactEstimatorProjectService extends ProjectService {
    public getArtifactEstimatorProjects: () => Observable<ArtifactEstimatorProject[]>;
    public getArtifactEstimatorProject: (id: number) => Observable<ArtifactEstimatorProject>;
    public updateArtifactEstimatorProject: (project: ArtifactEstimatorProject) => Observable<ArtifactEstimatorProject>;
    public createArtifactEstimatorProject: (project: ArtifactEstimatorProject) => Observable<ArtifactEstimatorProject>;
    public deleteArtifactEstimatorProject: (id: number) => Observable<DatabaseItem>;
    
    public deleteArtifactEstimator: (id: number) => Observable<DatabaseItem>;
    public addBreakpoint: (artifact_estimator_id: number, breakpoint: number) => Observable<ArtifactEstimator>;
    public clearArtifactEstimatorBreakpoints: (artifact_estimator_id: number) => Observable<ArtifactEstimator>;
    public clearCache: (id: number) => void;
    
    private _artifactEstimatorProjectsUrl = API_BASE + '/artifact-estimator-project/';
    private _artifactEstimatorUrl = API_BASE + "/artifact-estimator/";
    private _artifactEstimatorProjectsCache = new LRUCache<ArtifactEstimatorProject>(100);
    
    
    
    constructor(protected _commonServerMethods: CommonServerMethods) {
        super(_commonServerMethods)
        this.getArtifactEstimatorProjects = () => this._commonServerMethods.getList(ArtifactEstimatorProject, this._artifactEstimatorProjectsUrl)
        this.getArtifactEstimatorProject = (id: number) => this._commonServerMethods.getDetails(id, ArtifactEstimatorProject, this._artifactEstimatorProjectsUrl, this._artifactEstimatorProjectsCache);
        this.updateArtifactEstimatorProject = (project: ArtifactEstimatorProject) => this._commonServerMethods.updateItem(project, ArtifactEstimatorProject, this._artifactEstimatorProjectsUrl, this._artifactEstimatorProjectsCache);
        this.createArtifactEstimatorProject = (project: ArtifactEstimatorProject) => this._commonServerMethods.createItem(project, ArtifactEstimatorProject, this._artifactEstimatorProjectsUrl, this._artifactEstimatorProjectsCache);
        this.deleteArtifactEstimatorProject = (id: number) => this._commonServerMethods.deleteItem(id, this._artifactEstimatorProjectsUrl, this._artifactEstimatorProjectsCache);
        this.deleteArtifactEstimator = (id: number) => this._commonServerMethods.deleteItem(id, this._artifactEstimatorUrl)
        this.addBreakpoint = (artifact_estimator_id: number, breakpoint: number) => {
            return this._commonServerMethods.postJSON( {'breakpoint': breakpoint}, this._artifactEstimatorUrl + artifact_estimator_id + "/")
                        .map(res => <Object> res.json().data)
                        .map(res => {
                            let t = new ArtifactEstimator();
                            t.fillFromJSON(res);
                            return t;
                        })
        }
        this.clearArtifactEstimatorBreakpoints = (artifact_estimator_id: number) => {
            return this._commonServerMethods.getUrl(this._artifactEstimatorUrl + artifact_estimator_id + "/clear-breakpoints/")
                        .map(res => {
                            let t = new ArtifactEstimator();
                            t.fillFromJSON(res)
                            return t;
                        })
        }
        this.clearCache = (id: number) => this._artifactEstimatorProjectsCache.remove(id);
        
    }
}