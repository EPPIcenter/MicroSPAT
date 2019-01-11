import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { WebSocketBaseService } from '../base';
import { GenotypingProject } from '../../models/genotyping/project';
import { Store } from '@ngrx/store';
import * as fromRoot from '../../reducers';

@Injectable()
export class GenotypingProjectService extends WebSocketBaseService<GenotypingProject> {

  constructor(
    protected store: Store<fromRoot.AppState>, protected http: HttpClient
  ) {
    super('genotyping_project', store, http);
    this.registerTask('create_project', store);
    this.registerTask('delete_project', store);
    this.registerTask('add_samples', store);
    this.registerTask('remove_samples', store);
    this.registerTask('analyze_loci', store);
    this.registerTask('toggle_allele', store);
    this.registerTask('calculate_peak_probabilities', store);
  }

  public createGenotypingProject(genotypingProject: {
    title: string,
    creator: string,
    description: string,
    locus_set_id: number,
    bin_estimator_id: number,
    artifact_estimator_id?: number,
    quantification_bias_estimator_id?: number
  }) {
    this.socket.emit('create_project', genotypingProject);
  }

  public deleteGenotypingProject(project_id: number) {
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

  public uploadSampleFile(sampleFile: File, projectID: number) {
    this.uploadFile('add_samples', sampleFile, {
      project_id: projectID
    })
    .subscribe(res => {
      // console.log(res);
    })
  }

  public toggleAllele(binID: number, genotypeID: number) {
    this.socket.emit('toggle_allele', {
      'bin_id': binID,
      'genotype_id': genotypeID
    })
  }

  public getPeakData(projectID: number) {
    this.http.get(`${this.API_PATH}/${this.namespace}/${projectID}/get_peak_data/`, {responseType: 'blob'})
      .subscribe(res => {
        // console.log(res);
      })
  }

  public getAlleles(projectID: number) {
    this.http.get(`${this.API_PATH}/${this.namespace}/${projectID}/get_alleles/`, {responseType: 'blob'})
      .subscribe(res => {
        // console.log(res);
      });
  }

  public getPeakDataURL(projectID: number | string) {
    return `${this.API_PATH}/${this.namespace}/${projectID}/get_peak_data/`;
  }

  public getAllelesURL(projectID: number | string) {
    return `${this.API_PATH}/${this.namespace}/${projectID}/get_alleles/`
  }

  public calculatePeakProbabilities(project_id: number) {
    this.socket.emit('calculate_peak_probabilities', {
      project_id: project_id
    })
  }

}
