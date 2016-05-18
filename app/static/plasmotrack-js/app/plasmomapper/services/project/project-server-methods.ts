import { Injectable }       from '@angular/core';
import { Http, Response }   from '@angular/http';
import { Observable }       from 'rxjs/Observable';

import { CommonServerMethods } from '../utils/ServerMethods';
import { LocusParameters } from './locus-parameters/locus-parameters.model';

@Injectable()
export class ProjectServerMethods extends CommonServerMethods {
    constructor(protected http: Http) {
        super(http)
    };
    
}