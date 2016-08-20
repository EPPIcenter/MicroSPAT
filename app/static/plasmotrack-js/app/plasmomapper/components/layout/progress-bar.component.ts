import { Component } from '@angular/core';

@Component({
    selector: 'pm-progress-bar',
    inputs: ['label', 'fullLabel'],
    template:`
    <div class="progress">
        <div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%;">
            <span *ngIf="label">Loading {{label}}...</span>
            <span *ngIf="fullLabel">{{fullLabel}}</span>
        </div>
    </div>
    `
})
export class ProgressBarComponent {
    public label: string;
    public fullLabel: string;
}