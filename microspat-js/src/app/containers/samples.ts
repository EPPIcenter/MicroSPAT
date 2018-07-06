import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';
import * as fromSample from 'app/reducers/samples/samples';



import * as samples from 'app/actions/samples';
import { SampleService } from 'app/services/sample/sample';

import { Sample } from 'app/models/sample/sample';
import { Task } from 'app/models/task';
import { EntityMap } from 'app/models/base';
import { Plate } from 'app/models/ce/plate';
import { Locus } from 'app/models/locus/locus';
import { Trace } from 'app/containers/components/plots/canvas';


@Component({
  selector: 'mspat-samples',
  template: `
  <div class="container-fluid">
    <div class="row">
      <div class="col-sm-5">
        <div class="row">
          <div class="col-sm-12">
          <mspat-sample-uploader
            [activeUploadSamplesTasks]="activeUploadSamplesTasks$ | async"
            [failedUploadSamplesTasks]="failedUploadSamplesTasks$ | async"
            [activeTasks]="activeTasks$ | async"
            (uploadSamples)="uploadSamples($event)">
            </mspat-sample-uploader>
          </div>
          <div class="col-sm-12">
            <mspat-sample-list
              [samples]="samples$ | async"
              [selectedSample]="selectedSample$ | async"
              [samplesLoading]="samplesLoading$ | async"
              (selectSample)="selectSample($event)">
            </mspat-sample-list>
          </div>
        </div>
      </div>
      <div class="col-sm-7">
        <mspat-sample-details *ngIf="selectedSample$ | async"
          [sample]="selectedSample$ | async"
          [channelsByLocus]="selectedSampleChannels$ | async"
          [plates]="plates$ | async"
          [loci]="loci$ | async"
          [selectedChannelID]="selectedChannelID$ | async"
          [selectedTrace]="selectedTrace$ | async"
          [selectedDomain]="selectedDomain$ | async"
          [selectedRange]="selectedRange$ | async"
          (selectChannel)="selectChannel($event)">
        </mspat-sample-details>
      </div>
    </div>
  </div>
  `
})
export class SamplesComponent {
  samples$: Observable<Sample[]>;
  plates$: Observable<EntityMap<Plate>>;
  loci$: Observable<EntityMap<Locus>>;

  selectedSample$: Observable<Sample>;
  samplesLoading$: Observable<boolean>;
  selectedSampleChannels$: Observable<fromSample.ChannelsByLocus[]>;

  selectedChannelID$: Observable<number>;

  selectedTrace$: Observable<Trace>;
  selectedDomain$: Observable<[number, number]>;
  selectedRange$: Observable<[number, number]>;

  channelLoading$: Observable<boolean>;

  activeUploadSamplesTasks$: Observable<Task[]>;
  failedUploadSamplesTasks$: Observable<Task[]>;
  activeTasks$: Observable<Task[]>;

  constructor(private store: Store<fromRoot.AppState>, private sampleService: SampleService) {
    this.samples$ = this.store.select(fromDB.selectSampleList);
    this.plates$ = this.store.select(fromDB.selectPlateEntities);
    this.loci$ = this.store.select(fromDB.selectLocusEntities);

    this.selectedSample$ = this.store.select(fromSample.selectActiveSample);
    this.samplesLoading$ = this.store.select(fromSample.selectLoadingSamples);
    // this.selectedSampleChannels$ = this.store.select(fromSample.selectSampleChannels);
    this.selectedSampleChannels$ = this.store.select(fromSample.selectSampleChannelList)
    this.selectedChannelID$ = this.store.select(fromSample.selectActiveChannelID);
    this.selectedTrace$ = this.store.select(fromSample.selectActiveTrace);
    this.selectedDomain$ = this.store.select(fromSample.selectActiveDomain);
    this.selectedRange$ = this.store.select(fromSample.selectActiveRange);

    // this.channelLoading$ = this.store.select(fromSample.selectChannelsLoading);

    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());

    this.activeUploadSamplesTasks$ = this.store.select(fromTasks.selectActiveTasks('sample', 'upload_samples'));
    this.failedUploadSamplesTasks$ = this.store.select(fromTasks.selectFailedTasks('sample', 'upload_samples'));
  }

  selectSample(id: number) {
    this.store.dispatch(new samples.SelectSampleAction(id));
  }

  uploadSamples(e: FileList) {
    this.sampleService.uploadSamples(e[0])
  }

  selectChannel(e: number) {
    this.store.dispatch(new samples.SelectChannelAction(e));
  }

}
