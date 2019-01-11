import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { Store } from '@ngrx/store';

import * as fromRoot from 'app/reducers';

import * as navigation from 'app/actions/navigation';
import { Task } from 'app/models/task';

// <li class="nav-item">
// <a class="nav-link" routerLinkActive='active' routerLink="/quant-bias-estimators">Quantification Bias Estimators</a>
// </li>


// <li class="nav-item">
// <a class="nav-link" routerLinkActive='active' routerLink="/controls">Controls</a>
// </li>

@Component({
  selector: 'mspat-sidenav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="app-name">
    <h6>MicroSPAT</h6>
  </div>
  <ul *ngIf="!anyTask" class="nav nav-pills flex-column">
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/plates">Plates</a>
    </li>
    <li class="nav-item" (click)="samplesActivated()">
      <a class="nav-link" routerLinkActive='active' routerLink="/samples">Samples</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/controls">Controls</a>
    </li>
    <li class="nav-item" (click)="genotypingProjectsActivated()">
      <a class="nav-link" routerLinkActive='active' routerLink="/genotyping-projects">Genotyping Projects</a>
    </li>
    <li class="nav-item" (click)="artifactEstimatorsActivated()">
      <a class="nav-link" routerLinkActive='active' routerLink="/artifact-estimators">Artifact Estimators</a>
    </li>
    <li class="nav-item" (click)="binEstimatorsActivated()">
      <a class="nav-link" routerLinkActive='active' routerLink="/bin-estimators">Bin Estimators</a>
    </li>
    <li class="nav-item" (click)="quantificationBiasEstimatorsActivated()">
      <a class="nav-link" routerLinkActive='active' routerLink='/quant-bias-estimators'>Quantification Bias Estimators</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/loci">Loci</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/locus-sets">Locus Sets</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/ladders">Ladders</a>
    </li>
  </ul>


  <ul *ngIf="anyTask" class="nav nav-pills flex-column">
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Plates</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Samples</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Controls</a>
    </li>
    <li class="nav-item" >
      <a class="nav-link" routerLinkActive='inactive'>Genotyping Projects</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Artifact Estimators</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Bin Estimators</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Quantification Bias Estimators</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Loci</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Locus Sets</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='inactive'>Ladders</a>
    </li>
  </ul>

  `,
  styles: [`
    .app-name {
      padding: 8px;
    }
  `]
})
export class SideNavComponent {

  @Input() activeTasks: Task[] = [];

  get anyTask() {
    return this.activeTasks.length > 0;
  }

  constructor(private store: Store<fromRoot.AppState>) {};

  samplesActivated() {
    this.store.dispatch(new navigation.ActivateSamplesPathAction());
  }

  artifactEstimatorsActivated() {
    this.store.dispatch(new navigation.ActivateArtifactEstimatorPathAction());
  }

  binEstimatorsActivated() {
    this.store.dispatch(new navigation.ActivateBinEstimatorPathAction());
  }

  quantificationBiasEstimatorsActivated() {
    this.store.dispatch(new navigation.ActivateQuantificationBiasEstimatorPathAction());
  }

  genotypingProjectsActivated() {
    this.store.dispatch(new navigation.ActivateGenotypingProjectPathAction());
  }
}
