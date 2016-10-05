import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
    inputs: ['qb'],
    selector: 'pm-quant-bias-locus-plot',
    template: `
        <div style="height:35vh" id="plot-container"></div>
    `
})
export class QuantificationBiasLocusPlot implements OnInit, OnDestroy {


    constructor(){

    }

    ngOnInit(){

    }

    ngOnDestroy(){

    }

}