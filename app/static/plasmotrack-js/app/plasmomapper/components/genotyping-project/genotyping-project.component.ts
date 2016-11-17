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

import { Component, OnInit } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

// import { GenotypingProject } from '../../services/genotyping-project/genotyping-project.model';
// import { GenotypingProjectService } from '../../services/genotyping-project/genotyping-project.service';

import { GenotypingProjectListComponent } from './genotyping-project-list.component';
import { GenotypingProjectDetailComponent } from './genotyping-project-details/genotyping-project-detail.component'; 

import { GenotypingProjectSampleList } from './genotyping-project-details/samples/genotyping-project-sample-list.component';
import { GenotypingProjectSampleDetail } from './genotyping-project-details/samples/genotyping-project-sample-detail.component';
import { GenotypingProjectSampleChannel } from './genotyping-project-details/samples/genotyping-project-sample-channel.component';

import { GenotypingProjectLocusList } from './genotyping-project-details/loci/genotyping-project-locus-list.component';
import { GenotypingProjectLocusDetail } from './genotyping-project-details/loci/genotyping-project-locus-detail.component';
import { GenotypingProjectLocusChannel } from './genotyping-project-details/loci/genotyping-project-locus-channel.component';
 
 
@Component({
    selector: 'pm-genotyping-project',
    template: '<router-outlet></router-outlet>',
    directives: [ROUTER_DIRECTIVES],
})
@RouteConfig([
    {
        path: '/',
        name: 'GenotypingProjectList',
        component: GenotypingProjectListComponent,
        useAsDefault: true
    },
    {
        path: '/:project_id',
        name: 'GenotypingProjectDetail',
        component: GenotypingProjectDetailComponent,
    },
    {
        path: '/:project_id/samples',
        name: 'GenotypingProjectSampleList',
        component: GenotypingProjectSampleList
    },
    {
        path: '/:project_id/samples/:sample_id',
        name: 'GenotypingProjectSampleDetail',
        component: GenotypingProjectSampleDetail
    },
    {
        path: '/:project_id/samples/:sample_id/channels',
        name: 'GenotypingProjectSampleChannel',
        component: GenotypingProjectSampleChannel
    },
    {
        path: '/:project_id/loci',
        name: 'GenotypingProjectLocusList',
        component: GenotypingProjectLocusList
    },
    {
        path: '/:project_id/loci/:locus_id',
        name: 'GenotypingProjectLocusDetail',
        component: GenotypingProjectLocusDetail
    },
    {
        path: '/:project_id/loci/:locus_id/channels',
        name: 'GenotypingProjectLocusChannel',
        component: GenotypingProjectLocusChannel
    },
    // {
    //     path: '/:project_id/channel/:channel_annotation_id'
    // }
])
export class GenotypingProjectComponent {
    
 
}