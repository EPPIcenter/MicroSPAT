import { Injectable }           from '@angular/core';
import { SERVER_BASE, API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { SampleBasedProjectService }       from '../sample-based-project/sample-based-project.service';

import { DatabaseItem }         from '../DatabaseItem';
import { GenotypingProject }    from './genotyping-project.model';
import { GenotypingLocusParameters } from './locus-parameters/genotyping-locus-parameters.model';
import { SampleLocusAnnotation } from '../sample-based-project/sample-annotation/locus-annotation/sample-locus-annotation.model';


@Injectable()
export class GenotypingProjectService extends SampleBasedProjectService {
    public getProjects: () => Observable<GenotypingProject[]>;
    public getProject: (id: number) => Observable<GenotypingProject>;
    public updateProject: (project: GenotypingProject) => Observable<GenotypingProject>;
    public createProject: (project: GenotypingProject) => Observable<GenotypingProject>;
    public deleteProject: (id: number) => Observable<DatabaseItem>;
    public calculateProbability: (project: GenotypingProject) => Observable<any>;
    public saveAnnotations: (annotations: SampleLocusAnnotation[]) => Observable<any>;
    public getAlleles: (id: number) => Observable<any>;
    public getDominantAlleles: (id: number) => Observable<any>;
    
    public addSamples: (files: File[], id: number) => Observable<GenotypingProject>;

    public artifactEstimatorChanged: (artifact_estimator_id: number) => void;
    public binEstimatorChanged: (bin_estimator_id: number) => void;
    
    public clearCache: (id: number) => void;
    
    private _projectsUrl = API_BASE + '/genotyping-project/';
    private _annotationsUrl = API_BASE + '/locus-annotations/';
    private _projectCache = new LRUCache<GenotypingProject>(100);
    
    protected _socket: SocketIOClient.Socket;
    
    constructor (protected _commonServerMethods: CommonServerMethods) {
        super(_commonServerMethods);
        this._socket = io(SERVER_BASE + "/project")
        
        this._socket.on('list_all', (event) => {
        })
        
        this.getProjects = () => {
            // this._socket.emit('list');
            return this._commonServerMethods.getList(GenotypingProject, this._projectsUrl)  
        };
        
        this.getProject = (id: number) => {
            return this._commonServerMethods.getDetails(id, GenotypingProject, this._projectsUrl, this._projectCache);
        };
        
        this.updateProject = (project: GenotypingProject) => {
            return this._commonServerMethods.updateItem(project, GenotypingProject, this._projectsUrl, this._projectCache);
        };
        
        this.createProject = (project: GenotypingProject) => {
            if(project.id == null) {
                return this._commonServerMethods.createItem(project, GenotypingProject, this._projectsUrl, this._projectCache);
            }
        };
        
        this.deleteProject = (id: number) => {
            return this._commonServerMethods.deleteItem(id, this._projectsUrl, this._projectCache);
        };
        
        this.addSamples = (files: File[], id: number) => {
            return this._commonServerMethods.postFiles(files, this._projectsUrl + id + "/add-samples/", {})
                .map(proj => {
                    let t = new GenotypingProject();
                    t.fillFromJSON(proj);
                    this._projectCache.set(t.id, t);
                    return t;
                })
        }
        
        this.clearCache = (id: number) => this._projectCache.remove(id);
        
        this.saveAnnotations = (annotations: SampleLocusAnnotation[]) => {
            return this._commonServerMethods.postJSON(annotations, this._annotationsUrl);
        }

        this.getAlleles = (id: number) => {
            return this._commonServerMethods.getFile(this._projectsUrl + id + "/get-alleles/")
        }

        this.getDominantAlleles = (id: number) => {
            return this._commonServerMethods.getFile(this._projectsUrl + id + "/get-dominant-alleles/")
        }
        
        this.calculateProbability = (project: GenotypingProject) => {
            return this._commonServerMethods.postJSON(project, this._projectsUrl + "calculate-probability/")
                .map(p => {
                    this.clearCache(project.id);
                    return p;
                })
        }

        this.artifactEstimatorChanged = (artifact_estimator_id: number) => {
            let gps = [];
            
            this._projectCache.forEach((proj_id: number, proj: GenotypingProject) => {
                if(proj.artifact_estimator_id === artifact_estimator_id) {
                    gps.push(proj.id);
                }
            })

            gps.forEach(id => {
                this.clearCache(id);
            })
                
        }

        this.binEstimatorChanged = (bin_estimator_id: number) => {
            let gps = [];
            
            this._projectCache.forEach((proj_id: number, proj: GenotypingProject) => {
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