import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';

import { KeyDownAction, KeyUpAction } from 'app/actions/keyboard';
import * as fromRoot from 'app/reducers';


@Injectable()
export class KeyboardService {
  constructor(protected store: Store<fromRoot.AppState>) {
    window.addEventListener('keydown', (e) => store.dispatch(new KeyDownAction(e)));
    window.addEventListener('keyup', (e) => store.dispatch(new KeyUpAction(e)));
  }
}
