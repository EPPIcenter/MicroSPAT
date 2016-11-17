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
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { ProjectService }       from '../project/project.service';

import { DatabaseItem }             from '../DatabaseItem';
import { ArtifactEstimatorProject } from './artifact-estimator-project.model';
import { ArtifactEstimator }        from './locus-artifact-estimator/artifact-estimator/artifact-estimator.model';
import { ArtifactEquationParameterSet } from './locus-artifact-estimator/artifact-estimator/artifact-equation/artifact-equation-parameter-set.model';

class AEMEthods {
}

@Injectable()
export class ArtifactEstimatorProjectService extends ProjectService {
    public getArtifactEstimatorProjects: () => Observable<ArtifactEstimatorProject[]>;
    public getArtifactEstimatorProject: (id: number) => Observable<ArtifactEstimatorProject>;
    public updateArtifactEstimatorProject: (project: ArtifactEstimatorProject) => Observable<ArtifactEstimatorProject>;
    public createArtifactEstimatorProject: (project: ArtifactEstimatorProject) => Observable<ArtifactEstimatorProject>;
    public deleteArtifactEstimatorProject: (id: number) => Observable<DatabaseItem>;
    
    public deleteArtifactEstimator: (id: number) => Observable<DatabaseItem>;
    public addBreakpoint: (artifact_estimator_id: number, breakpoint: number) => Observable<ArtifactEstimator>;

    public recalculateArtifactEquations: (artifact_estimator_id: number, parameters: ArtifactEquationParameterSet[]) => Observable<ArtifactEstimator>;
    public clearArtifactEstimatorBreakpoints: (artifact_estimator_id: number) => Observable<ArtifactEstimator>;
    public clearCache: (id: number) => void;

    public binEstimatorChanged: (bin_estimator_id: number) => void;
    
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

        this.recalculateArtifactEquations = (artifact_estimator_id: number, parameters: ArtifactEquationParameterSet[]) => {
            return this._commonServerMethods.postJSON(parameters, 
                this._artifactEstimatorUrl + artifact_estimator_id + "/recalculate-artifact-equations/")
                .map(res => <Object> res.json().data)
                .map(res => {
                    console.log(res);
                    let t = new ArtifactEstimator();
                    t.fillFromJSON(res);
                    return t;
                })
        }
        
        this.clearArtifactEstimatorBreakpoints = (artifact_estimator_id: number) => {
            return this._commonServerMethods.getUrl(this._artifactEstimatorUrl + artifact_estimator_id + "/clear-breakpoints/")
                        .map(res => {
                            let t = new ArtifactEstimator();
                            t.fillFromJSON(res);
                            return t;
                        })
        }
        
        this.clearCache = (id: number) => this._artifactEstimatorProjectsCache.remove(id);

        this.binEstimatorChanged = (bin_estimator_id: number) => {
            let gps = [];
            
            this._artifactEstimatorProjectsCache.forEach((proj_id: number, proj: ArtifactEstimatorProject) => {
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