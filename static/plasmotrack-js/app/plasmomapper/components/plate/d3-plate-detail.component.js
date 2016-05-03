System.register(['angular2/core', '../../services/ladder/ladder.service', '../../services/plate/plate.service', '../../services/well/well.service', '../../services/channel/channel.service', './d3-plate-ladder-detail.component', './d3-ladder-editor.component', './d3-plate-channel-detail.component', './d3-well-viewer.component'], function(exports_1, context_1) {
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
    var core_1, ladder_service_1, plate_service_1, well_service_1, channel_service_1, d3_plate_ladder_detail_component_1, d3_ladder_editor_component_1, d3_plate_channel_detail_component_1, d3_well_viewer_component_1;
    var PlateDetailComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (ladder_service_1_1) {
                ladder_service_1 = ladder_service_1_1;
            },
            function (plate_service_1_1) {
                plate_service_1 = plate_service_1_1;
            },
            function (well_service_1_1) {
                well_service_1 = well_service_1_1;
            },
            function (channel_service_1_1) {
                channel_service_1 = channel_service_1_1;
            },
            function (d3_plate_ladder_detail_component_1_1) {
                d3_plate_ladder_detail_component_1 = d3_plate_ladder_detail_component_1_1;
            },
            function (d3_ladder_editor_component_1_1) {
                d3_ladder_editor_component_1 = d3_ladder_editor_component_1_1;
            },
            function (d3_plate_channel_detail_component_1_1) {
                d3_plate_channel_detail_component_1 = d3_plate_channel_detail_component_1_1;
            },
            function (d3_well_viewer_component_1_1) {
                d3_well_viewer_component_1 = d3_well_viewer_component_1_1;
            }],
        execute: function() {
            PlateDetailComponent = (function () {
                function PlateDetailComponent(_plateService, _wellService, _ladderService, _channelService) {
                    this._plateService = _plateService;
                    this._wellService = _wellService;
                    this._ladderService = _ladderService;
                    this._channelService = _channelService;
                    this.filesToUpload = [];
                    this.showSelectedPlate = true;
                    this.uploading = false;
                }
                PlateDetailComponent.prototype.wellSelector = function (id) {
                    var _this = this;
                    this._wellService.getWell(id).subscribe(function (well) {
                        console.log(well);
                        _this.selectedWell = well;
                    });
                };
                PlateDetailComponent.prototype.fileChangeEvent = function (fileInput) {
                    console.log(this.files);
                    this.filesToUpload = fileInput.target.files;
                };
                PlateDetailComponent.prototype.upload = function () {
                    var _this = this;
                    this.plateMapError = null;
                    this.uploading = true;
                    console.log(this.filesToUpload);
                    this._plateService.postPlateMap(this.filesToUpload, this.plate.id)
                        .subscribe(function (plate) {
                        _this.plate = plate;
                    }, function (err) {
                        _this.uploading = false;
                        _this.plateMapError = err;
                    }, function () {
                        _this.uploading = false;
                    });
                };
                PlateDetailComponent.prototype.recalculateLadder = function (well) {
                    var _this = this;
                    console.log("Recalculating Ladder Promise");
                    console.log(well);
                    this._wellService.recalculateLadder(well.id, well.ladder_peak_indices)
                        .subscribe(null, null, function () { return _this._wellService.getWell(well.id).subscribe(function (new_well) {
                        _this.selectedWell = new_well;
                    }, null, function () {
                        _this._plateService.clearPlateFromCache(_this.plate.id);
                        _this._plateService.getPlate(_this.plate.id).subscribe(function (plate) { return _this.plate = plate; });
                    }); });
                };
                PlateDetailComponent.prototype.ngOnInit = function () {
                    this.selectWell = this.wellSelector.bind(this);
                };
                PlateDetailComponent.prototype.ngOnChanges = function () {
                    this.selectedWell = null;
                    this.ladderChannel = null;
                };
                PlateDetailComponent.prototype.ladderRecalculated = function (well) {
                    console.log(well);
                    console.log("Recalculating Ladder Event");
                    this.recalculateLadder(well);
                };
                PlateDetailComponent = __decorate([
                    core_1.Component({
                        inputs: ['plate'],
                        selector: 'pm-d3-plate-detail',
                        template: "\n    <div class=\"panel panel-default\">\n        <div (click)=\"showSelectedPlate = !showSelectedPlate\" class=\"panel-heading\">\n            <h3 class=\"panel-title\">{{plate.label}}\n            <span *ngIf=\"!showSelectedPlate\" class=\"glyphicon glyphicon-menu-right pull-right\"></span>\n            <span *ngIf=\"showSelectedPlate\" class=\"glyphicon glyphicon-menu-down pull-right\"></span>\n            </h3>\n        </div>\n        <div *ngIf=\"showSelectedPlate\" class=\"panel-body\">\n            <div class=\"row\" style=\"height: 20vh; padding-bottom: 1vh\">\n                <div class=\"col-sm-5\" style=\"height: 100%\">\n                    <pm-d3-plate-ladder-detail [plate]=\"plate\" [wellSelector]=\"selectWell\"></pm-d3-plate-ladder-detail>\n                </div>\n                <div class=\"col-sm-4\" style=\"height:100%\">\n                    <pm-d3-plate-channel-detail [plate]=\"plate\" [wellSelector]=\"selectWell\"></pm-d3-plate-channel-detail>\n                </div>\n                <div class=\"col-sm-2\">\n                    <form>\n                        <div class=\"form-group\">\n                            <input type=\"file\" (change)=\"fileChangeEvent($event)\" placeholder=\"Upload file...\"/>\n                        </div>\n                        <button class=\"btn btn-primary\" type=\"button\" [ngClass]=\"{disabled: uploading}\" (click)=\"upload()\">Upload Plate Map</button>\n                    </form>\n                    <span class=\"label label-danger\">{{plateMapError}}</span>\n                    <span *ngIf=\"uploading\" class=\"label label-info\">Uploading...</span>\n                </div>\n            </div>\n            <div *ngIf=\"selectedWell\">\n                <div class=\"row\" style=\"padding-top: 1vh\">\n                    <pm-d3-ladder-editor (ladderRecalculated)=\"ladderRecalculated($event)\" [well]=\"selectedWell\"></pm-d3-ladder-editor>\n                </div>\n                <div class=\"row\" style=\"padding-top: 1vh\">\n                    <pm-d3-well-viewer [well]=\"selectedWell\"></pm-d3-well-viewer>\n                </div>\n            <div>\n        <div>\n    </div>\n    ",
                        directives: [d3_plate_ladder_detail_component_1.D3PlateLadderDetailComponent, d3_ladder_editor_component_1.D3LadderEditorComponent, d3_plate_channel_detail_component_1.D3PlateChannelDetailComponent, d3_well_viewer_component_1.D3WellViewerComponent]
                    }), 
                    __metadata('design:paramtypes', [plate_service_1.PlateService, well_service_1.WellService, ladder_service_1.LadderService, channel_service_1.ChannelService])
                ], PlateDetailComponent);
                return PlateDetailComponent;
            }());
            exports_1("PlateDetailComponent", PlateDetailComponent);
        }
    }
});
//# sourceMappingURL=d3-plate-detail.component.js.map