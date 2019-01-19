import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PlatesComponent } from './containers/plates';
import { ArtifactEstimatorsComponent } from './containers/artifact-estimators';
import { BinEstimatorsComponent } from './containers/bin-estimators';
import { ControlsComponent } from './containers/controls';
import { GenotypingProjectsComponent } from './containers/genotyping-projects';
import { LaddersComponent } from './containers/ladders';
import { LociComponent } from './containers/loci';
import { LocusSetsComponent } from './containers/locus-sets';
import { QuantificationBiasEstimatorsComponent } from './containers/quant-bias-estimators';
import { SamplesComponent } from './containers/samples';


export const routes: Routes = [
  {
    path: 'artifact-estimators',
    component: ArtifactEstimatorsComponent
  },
  {
    path: 'bin-estimators',
    component: BinEstimatorsComponent
  },
  {
    path: 'controls',
    component: ControlsComponent
  },
  {
    path: 'genotyping-projects',
    component: GenotypingProjectsComponent
  },
  {
    path: 'ladders',
    component: LaddersComponent
  },
  {
    path: 'loci',
    component: LociComponent
  },
  {
    path: 'locus-sets',
    component: LocusSetsComponent
  },
  {
    path: 'plates',
    component: PlatesComponent
  },
  {
    path: 'quant-bias-estimators',
    component: QuantificationBiasEstimatorsComponent
  },
  {
    path: 'samples',
    component: SamplesComponent
  }
];

@NgModule({
  imports: [ RouterModule.forRoot(routes) ],
  exports: [ RouterModule ]
})
export class AppRoutingModule {}
