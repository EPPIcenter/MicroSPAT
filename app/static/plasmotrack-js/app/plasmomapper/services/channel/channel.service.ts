import { Injectable }           from 'angular2/core';
import { Http, Response }       from 'angular2/http';
import { API_BASE }             from '../../api';

import { Observable }           from 'rxjs/Observable';

import { LRUCache }             from '../utils/LRUCache';
import { CommonServerMethods }  from '../utils/ServerMethods';

import { Channel }              from './channel.model';


@Injectable()
export class ChannelService {
    public getChannel: (id: number) => Observable<Channel>
    
    private _channelsUrl = API_BASE + '/channel/';
    private _channelCache = new LRUCache<Channel>(385);
    
    constructor(private _commonServerMethods: CommonServerMethods) {
        this.getChannel = (id: number) => this._commonServerMethods.getDetails(id, Channel, this._channelsUrl, this._channelCache);
    }

}