import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PlatesComponent } from 'app/containers/plates';
import { ArtifactEstimatorsComponent } from 'app/containers/artifact-estimators';
import { BinEstimatorsComponent } from 'app/containers/bin-estimators';
import { ControlsComponent } from 'app/containers/controls';
import { GenotypingProjectsComponent } from 'app/containers/genotyping-projects';
import { LaddersComponent } from 'app/containers/ladders';
import { LociComponent } from 'app/containers/loci';
import { LocusSetsComponent } from 'app/containers/locus-sets';
import { QuantificationBiasEstimatorsComponent } from 'app/containers/quant-bias-estimators';
import { SamplesComponent } from 'app/containers/samples';


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
