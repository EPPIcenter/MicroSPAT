import { Injectable }           from '@angular/core';
import { SERVER_BASE, API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { SampleBasedProjectService }       from '../sample-based-project/sample-based-project.service';

import { DatabaseItem }         from '../DatabaseItem';
import { GenotypingProject }    from './genotyping-project.model';
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
    public clearCache: (id: number) => void;
    
    private _projectsUrl = API_BASE + '/genotyping-project/';
    private _annotationsUrl = API_BASE + '/locus-annotations/';
    private _projectCache = new LRUCache<GenotypingProject>(100);
    
    protected _socket: SocketIOClient.Socket;
    
    constructor (protected _commonServerMethods: CommonServerMethods) {
        super(_commonServerMethods);
        this._socket = io(SERVER_BASE + "/project")
        
        this._socket.on('list_all', (event) => {
            console.log("Listing Projects Received");
            console.log(event);
        })
        
        this.getProjects = () => {
            console.log("Listing Projects");
            this._socket.emit('list');
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
        
        this.clearCache = (id: number) => this._projectCache.remove(id);
        
        this.saveAnnotations = (annotations: SampleLocusAnnotation[]) => {
            return this._commonServerMethods.postJSON(annotations, this._annotationsUrl);
        }
        
        this.calculateProbability = (project: GenotypingProject) => {
            return this._commonServerMethods.postJSON(project, this._projectsUrl + "calculate-probability/")
        }
    }
}