System.register(['angular2/core', '../../services/ladder/ladder.service', './d3-well-plot.component'], function(exports_1, context_1) {
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
    var core_1, ladder_service_1, d3_well_plot_component_1;
    var D3PlateLadderDetailComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (ladder_service_1_1) {
                ladder_service_1 = ladder_service_1_1;
            },
            function (d3_well_plot_component_1_1) {
                d3_well_plot_component_1 = d3_well_plot_component_1_1;
            }],
        execute: function() {
            D3PlateLadderDetailComponent = (function () {
                function D3PlateLadderDetailComponent(_ladderService) {
                    this._ladderService = _ladderService;
                    this.errorMessages = [];
                }
                D3PlateLadderDetailComponent.prototype.ngOnChanges = function () {
                    var _this = this;
                    this.squares = [];
                    this.wellArrangement = this.plate.well_arrangement;
                    this.plate.wells.forEach(function (well, well_label) {
                        var color;
                        _this._ladderService.getLadder(well.ladder_id).subscribe(function (ladder) {
                            if (!well.sizing_quality) {
                                color = "#f0ad4e";
                            }
                            else if (well.sizing_quality < ladder.sq_limit) {
                                color = "#5cb85c";
                            }
                            else {
                                color = "#d9534f";
                            }
                            _this.squares.push({
                                'well_label': well.well_label,
                                'color': color,
                                'id': well.id
                            });
                        }, function (err) {
                            console.error(err);
                            _this.errorMessages.push(err);
                        });
                    });
                };
                D3PlateLadderDetailComponent = __decorate([
                    core_1.Component({
                        inputs: ['plate', 'wellSelector'],
                        selector: 'pm-d3-plate-ladder-detail',
                        template: "\n        <pm-d3-well-plot style=\"height: 100%\" (wellSelected)=\"wellSelector($event)\" [squares]=\"squares\" [wellArrangement]=\"wellArrangement\" [label]=\"'Ladder'\"></pm-d3-well-plot>\n    ",
                        directives: [d3_well_plot_component_1.D3WellPlotComponent]
                    }), 
                    __metadata('design:paramtypes', [ladder_service_1.LadderService])
                ], D3PlateLadderDetailComponent);
                return D3PlateLadderDetailComponent;
            }());
            exports_1("D3PlateLadderDetailComponent", D3PlateLadderDetailComponent);
        }
    }
});
//# sourceMappingURL=d3-plate-ladder-detail.component.js.map