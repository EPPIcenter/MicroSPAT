import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { Store } from '@ngrx/store';

import * as fromRoot from 'app/reducers';

import * as navigation from 'app/actions/navigation';


@Component({
  selector: 'mspat-sidenav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <h6>MicroSPAT</h6>
  <ul class="nav nav-pills flex-column">
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/plates">Plates</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/samples">Samples</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/controls">Controls</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/genotyping-projects">Genotyping Projects</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/artifact-estimators">Artifact Estimators</a>
    </li>
    <li class="nav-item" (click)="binEstimatorsActivated()">
      <a class="nav-link" routerLinkActive='active' routerLink="/bin-estimators">Bin Estimators</a>
    </li>
    <li class="nav-item">
      <a class="nav-link" routerLinkActive='active' routerLink="/quant-bias-estimators">Quantification Bias Estimators</a>
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
  `
})
export class SideNavComponent {

  constructor(private store: Store<fromRoot.AppState>) {};


  binEstimatorsActivated() {
    this.store.dispatch(new navigation.ActivateBinEstimatorPathAction());
  }
}
