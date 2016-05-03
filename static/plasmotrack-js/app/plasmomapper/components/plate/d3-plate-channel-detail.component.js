System.register(['angular2/core', 'd3', './d3-well-plot.component'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    var __metadata = (this && this.__metadata) || function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };
    var core_1, d3, d3_well_plot_component_1;
    var D3PlateChannelDetailComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (d3_1) {
                d3 = d3_1;
            },
            function (d3_well_plot_component_1_1) {
                d3_well_plot_component_1 = d3_well_plot_component_1_1;
            }],
        execute: function() {
            D3PlateChannelDetailComponent = (function () {
                function D3PlateChannelDetailComponent() {
                    this.color_scale = d3.scale.linear()
                        .domain([0, 3000, 34000])
                        .range(['#d9534f', '#5cb85c', '#4292D1']);
                }
                D3PlateChannelDetailComponent.prototype.ngOnChanges = function () {
                    var _this = this;
                    console.log("Changes Happened in channel detail component");
                    this.channelSets = [];
                    this.wellArrangement = this.plate.well_arrangement;
                    var channel_map = new Map();
                    this.plate.wells.forEach(function (well, well_label) {
                        well.channels.forEach(function (channel, color) {
                            if (!channel_map.has(color)) {
                                channel_map.set(color, []);
                            }
                            channel_map.get(color).push({
                                'well_label': well_label,
                                'color': _this.color_scale(channel.max_data_point),
                                'id': well.id
                            });
                        });
                    });
                    channel_map.forEach(function (channelSet, color) {
                        _this.channelSets.push([color, channelSet]);
                    });
                };
                D3PlateChannelDetailComponent = __decorate([
                    core_1.Component({
                        inputs: ['plate', 'wellSelector'],
                        selector: 'pm-d3-plate-channel-detail',
                        template: "\n    <pm-d3-well-plot style=\"height:50%; padding:1vh\" class=\"col-sm-6\" *ngFor=\"#channelSet of channelSets\" (wellSelected) = \"wellSelector($event)\" [wellArrangement]=\"wellArrangement\" [squares]=\"channelSet[1]\" [label]=\"channelSet[0]\"></pm-d3-well-plot>\n    ",
                        directives: [d3_well_plot_component_1.D3WellPlotComponent]
                    }), 
                    __metadata('design:paramtypes', [])
                ], D3PlateChannelDetailComponent);
                return D3PlateChannelDetailComponent;
            }());
            exports_1("D3PlateChannelDetailComponent", D3PlateChannelDetailComponent);
        }
    }
});
//# sourceMappingURL=d3-plate-channel-detail.component.js.map