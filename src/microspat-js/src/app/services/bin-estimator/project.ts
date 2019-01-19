import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';

import { WebSocketBaseService } from '../base';

import { BinEstimatorProject } from '../../models/bin-estimator/project';
import * as fromRoot from '../../reducers';



@Injectable()
export class BinEstimatorProjectService extends WebSocketBaseService<BinEstimatorProject> {

  constructor(
    protected store: Store<fromRoot.AppState>, http: HttpClient
  ) {
    super('bin_estimator_project', store, http);
    this.registerTask('delete_project', store);
    this.registerTask('create_project', store);
    this.registerTask('add_samples', store);
    this.registerTask('remove_samples', store);
    this.registerTask('analyze_loci', store);
  }

  public createBinEstimatorProject(binEstimator: {
    title: string,
    creator: string,
    description: string,
    locus_set_id: number
  }) {
    this.socket.emit('create_project', binEstimator);
  }

  public deleteBinEstimatorProject(project_id: number) {
    this.socket.emit('delete_project', {
      project_id: project_id
    })
  }

  public addSamples(project_id: number, sample_ids: number[]) {
    this.socket.emit('add_samples', {
      project_id: project_id,
      sample_ids: sample_ids
    })
  }

  public removeSamples(project_id: number, sample_ids: number[]) {
    this.socket.emit('remove_samples', {
      project_id: project_id,
      sample_ids: sample_ids
    })
  }

  public analyzeLoci(locus_parameter_ids: number[], parameter_settings = {}) {
    this.socket.emit('analyze_loci', {
      locus_parameter_ids: locus_parameter_ids,
      parameter_settings: parameter_settings
    })
  }

}
