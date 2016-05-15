import {enableProdMode} from 'angular2/core';
import {bootstrap}      from 'angular2/platform/browser';
import {PlasmoTrackComponent}   from './plasmotrack.component';
import {HTTP_PROVIDERS} from 'angular2/http';

// enableProdMode();
bootstrap(PlasmoTrackComponent, [HTTP_PROVIDERS]);
