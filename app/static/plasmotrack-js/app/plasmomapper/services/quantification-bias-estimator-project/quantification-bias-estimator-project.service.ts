import { Injectable }           from '@angular/core';
import { Http, Response }       from '@angular/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { NotificationService } from '../notifications/notification.service';

import { ProjectService }       from '../project/project.service';

@Injectable()
export class QuantificationBiasEstimatorProjectService extends ProjectService {
    
}