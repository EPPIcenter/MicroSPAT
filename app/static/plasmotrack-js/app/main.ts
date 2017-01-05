// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import '../../node_modules/bootstrap/dist/css/bootstrap.css!';
import '../../node_modules/bootstrap/dist/css/bootstrap-theme.css!';
import '../../node_modules/toastr/build/toastr.css!';
import '../../styles.css!';


import {bootstrap}      from '@angular/platform-browser-dynamic'
import {PlasmoTrackComponent}   from './plasmotrack.component';

import {HTTP_PROVIDERS} from '@angular/http';
import {ROUTER_PROVIDERS} from '@angular/router-deprecated';

import * as d3 from 'd3';
// enableProdMode();

bootstrap(PlasmoTrackComponent, [HTTP_PROVIDERS, ROUTER_PROVIDERS]);
