import {bootstrap}      from '@angular/platform-browser-dynamic'
import {PlasmoTrackComponent}   from './plasmotrack.component';

import {HTTP_PROVIDERS} from '@angular/http';
import {ROUTER_PROVIDERS} from '@angular/router-deprecated';

// enableProdMode();
bootstrap(PlasmoTrackComponent, [HTTP_PROVIDERS, ROUTER_PROVIDERS]);
