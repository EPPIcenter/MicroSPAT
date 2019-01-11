import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { Channel } from '../../models/ce/channel';
import * as fromRoot from '../../reducers';


@Injectable()
export class ChannelService extends WebSocketBaseService<Channel> {

  constructor(
    protected store: Store<fromRoot.AppState>, http: HttpClient
  ) {
    super('channel', store, http);
  }

}
