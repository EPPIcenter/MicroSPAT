import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';

import { WebSocketBaseService } from '../base';
import { Channel } from '../../models/ce/channel';
import * as fromRoot from 'app/reducers';


@Injectable()
export class ChannelService extends WebSocketBaseService<Channel> {

  constructor(
    private store: Store<fromRoot.State>
  ) {
    super('channel', store);
  }

}
