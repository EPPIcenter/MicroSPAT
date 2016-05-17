import { Component, OnInit } from 'angular2/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from 'angular2/router';

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