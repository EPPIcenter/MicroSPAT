import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { QuantificationBiasEstimatorProject } from '../../models/quantification-bias-estimator/project';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class QuantificationBiasEstimatorProjectService extends WebSocketBaseService<QuantificationBiasEstimatorProject> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('quantification_bias_estimator_project', store, http);
    this.registerTask('create_project', store);
    this.registerTask('delete_project', store);
    this.registerTask('add_controls', store);
    this.registerTask('remove_samples', store);
    this.registerTask('analyze_loci', store);
  }

  public createQuantificationBiasEstimatorProject(artifactEstimator: {
    title: string,
    creator: string,
    description: string,
    locus_set_id: number,
    bin_estimator_id: number,
    artifact_estimator_id?: number
  }) {
    this.socket.emit('create_project', artifactEstimator);
  }

  public deleteQuantificationBiasEstimatorProject(project_id: number) {
    this.socket.emit('delete_project', {
      project_id: project_id
    })
  }

  public addControls(project_id: number, controls_file: File) {
    this.uploadFile('add_controls', controls_file, {project_id: project_id}).subscribe();
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
