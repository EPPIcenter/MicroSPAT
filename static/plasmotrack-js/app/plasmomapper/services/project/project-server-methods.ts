import { Injectable }       from 'angular2/core';
import { Http, Response }   from 'angular2/http';
import { Observable }       from 'rxjs/Observable';

import { CommonServerMethods } from '../utils/ServerMethods';
import { LocusParameters } from './locus-parameters/locus-parameters.model';

@Injectable()
export class ProjectServerMethods extends CommonServerMethods {
    constructor(protected http: Http) {
        super(http)
    };
    
}