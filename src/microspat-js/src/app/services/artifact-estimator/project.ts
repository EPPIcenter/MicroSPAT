import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';

import { WebSocketBaseService } from '../base';

import { ArtifactEstimatorProject } from '../../models/artifact-estimator/project';
import * as fromRoot from '../../reducers';

@Injectable()
export class ArtifactEstimatorProjectService extends WebSocketBaseService<ArtifactEstimatorProject> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('artifact_estimator_project', store, http);
    this.registerTask('create_project', store);
    this.registerTask('delete_project', store);
    this.registerTask('add_samples', store);
    this.registerTask('remove_samples', store);
    this.registerTask('analyze_loci', store);
    this.registerTask('add_breakpoint', store);
    this.registerTask('delete_artifact_estimator', store);
    this.registerTask('clear_breakpoints', store);
    this.registerTask('recalculate_equation', store);
  }

  public createArtifactEstimatorProject(artifactEstimator: {
    title: string,
    creator: string,
    description: string,
    locus_set_id: number
  }) {
    this.socket.emit('create_project', artifactEstimator);
  }

  public deleteArtifactEstimatorProject(project_id: number) {
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

  public addBreakpoint(id: number | string, base_size: number) {
    this.socket.emit('add_breakpoint', {
      id: id,
      base_size: base_size
    });
  }

  public deleteArtifactEstimator(id: number) {
    this.socket.emit('delete_artifact_estimator', {
      id: id
    });
  }

  public clearBreakpoints(id: number) {
    this.socket.emit('clear_breakpoints', {
      id: id
    })
  }

  public recalculateEquation(id: number, method: string) {
    this.socket.emit('recalculate_equation', {
      id: id,
      method: method
    })
  }
}
