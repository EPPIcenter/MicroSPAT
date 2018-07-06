import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { ArtifactEstimatorsComponent } from './artifact-estimators';
import { AppComponent } from './app';
import { BinEstimatorsComponent } from './bin-estimators';
import { ControlsComponent } from './controls';
import { GenotypingProjectsComponent } from './genotyping-projects';
import { LaddersComponent } from './ladders';
import { LociComponent } from './loci';
import { LocusSetsComponent } from './locus-sets';
import { PlatesComponent } from './plates';
import { QuantificationBiasEstimatorsComponent } from './quant-bias-estimators';
import { SamplesComponent } from './samples';
import { TaskComponent } from './task-progresss';

import { MspatMaterialModule } from './components/material.module';
import { ComponentModule } from './components';

export const CONTAINERS = [
  AppComponent,
  ArtifactEstimatorsComponent,
  BinEstimatorsComponent,
  ControlsComponent,
  GenotypingProjectsComponent,
  LaddersComponent,
  LociComponent,
  LocusSetsComponent,
  PlatesComponent,
  QuantificationBiasEstimatorsComponent,
  SamplesComponent,
  TaskComponent
];

@NgModule({
  imports: [
    CommonModule,
    MspatMaterialModule,
    ComponentModule,
    RouterModule
  ],
  declarations: CONTAINERS,
  exports: CONTAINERS
})

export class ContainerModule {};
