System.register(['angular2/core', 'angular2/router', '../layout/section-header.component', '../../services/plate/plate.service', '../../services/ladder/ladder.service', './d3-plate-detail.component'], function(exports_1, context_1) {
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
    var core_1, router_1, section_header_component_1, plate_service_1, ladder_service_1, d3_plate_detail_component_1;
    var PlateListComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (section_header_component_1_1) {
                section_header_component_1 = section_header_component_1_1;
            },
            function (plate_service_1_1) {
                plate_service_1 = plate_service_1_1;
            },
            function (ladder_service_1_1) {
                ladder_service_1 = ladder_service_1_1;
            },
            function (d3_plate_detail_component_1_1) {
                d3_plate_detail_component_1 = d3_plate_detail_component_1_1;
            }],
        execute: function() {
            PlateListComponent = (function () {
                function PlateListComponent(_plateService, _router, _ladderService) {
                    this._plateService = _plateService;
                    this._router = _router;
                    this._ladderService = _ladderService;
                    this.plates = [];
                    this.ladders = [];
                    this.errorMessages = [];
                    this.filesToUpload = [];
                    this.reversed = false;
                    this.sortingParam = 'label';
                    this.showNewPlate = true;
                    this.showSelectedPlate = true;
                    this.uploading = false;
                    this.uploadComplete = false;
                }
                PlateListComponent.prototype.getPlates = function () {
                    var _this = this;
                    console.log("Getting Plates");
                    this._plateService.getPlates()
                        .subscribe(function (plates) {
                        _this.plates = plates;
                        _this.sortPlates();
                    }, function (error) { return _this.errorMessages.push(error); });
                };
                PlateListComponent.prototype.sortPlates = function () {
                    var _this = this;
                    this.plates.sort(function (a, b) {
                        if (a[_this.sortingParam] < b[_this.sortingParam]) {
                            return 1;
                        }
                        else if (a[_this.sortingParam] > b[_this.sortingParam]) {
                            return -1;
                        }
                        else {
                            return 0;
                        }
                    });
                    if (this.reversed) {
                        this.plates.reverse();
                    }
                };
                PlateListComponent.prototype.getLadders = function () {
                    var _this = this;
                    this._ladderService.getLadders()
                        .subscribe(function (ladders) { return _this.ladders = ladders; }, function (error) { return _this.errorMessages.push(error); });
                };
                PlateListComponent.prototype.selectPlate = function (id) {
                    var _this = this;
                    this.showNewPlate = false;
                    this._plateService.getPlate(id).subscribe(function (plate) { return _this.selectedPlate = plate; }, function (err) { return _this.errorMessages.push(err); });
                };
                PlateListComponent.prototype.fileChangeEvent = function (fileInput) {
                    this.filesToUpload = fileInput.target.files;
                };
                PlateListComponent.prototype.upload = function () {
                    var _this = this;
                    this.newPlateError = null;
                    this.uploading = true;
                    this.uploadComplete = false;
                    console.log(this.filesToUpload);
                    console.log(this.ladder_id);
                    this._plateService.postPlates(this.filesToUpload, { 'ladder_id': this.ladder_id }).subscribe(function (plates) {
                        console.log(plates);
                        _this.selectedPlate = plates[0];
                    }, function (error) {
                        _this.newPlateError = error;
                        _this.uploading = false;
                    }, function () {
                        _this.getPlates();
                        _this.uploading = false;
                        _this.uploadComplete = true;
                    });
                };
                PlateListComponent.prototype.ngOnInit = function () {
                    this.getPlates();
                    this.getLadders();
                };
                PlateListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-plate-list',
                        template: "\n    <pm-section-header [header]=\"'Plates'\"></pm-section-header>\n    <div class=\"row main-container\">\n        <div class=\"col-sm-5\">\n            <div class=\"row\">\n                <div class=\"panel panel-default\">\n                    <div (click)=\"showNewPlate = !showNewPlate\" class=\"panel-heading\">\n                        <h3 class=\"panel-title\">New Plate\n                        <span *ngIf=\"!showNewPlate\" class=\"glyphicon glyphicon-menu-right pull-right\"></span>\n                        <span *ngIf=\"showNewPlate\" class=\"glyphicon glyphicon-menu-down pull-right\"></span>\n                        </h3>\n                    </div>\n                    <div *ngIf=\"showNewPlate\" class=\"panel-body\">\n                        <form>\n                            <div class=\"form-group\">\n                                <input type=\"file\" (change)=\"fileChangeEvent($event)\" placeholder=\"Upload file...\" multiple />\n                            </div>\n                            <div class=\"form-group\">\n                                <label>Ladder</label>\n                                <select required [(ngModel)]=\"ladder_id\" class=\"form-control\">\n                                    <option *ngFor=\"#ladder of ladders\" value={{ladder.id}}>{{ladder.label}}</option>\n                                </select>\n                            </div>\n                            <button class=\"btn btn-primary\" type=\"button\" (click)=\"upload()\">Upload</button>\n                        </form>\n                        <span *ngIf=\"uploading\" class=\"label label-info\">Uploading Files...</span>\n                        <span *ngIf=\"uploadComplete\" class=\"label label-success\">Upload Successful</span>\n                        <span class=\"label label-danger\">{{newPlateError}}</span>\n                    </div>\n                </div>\n            </div>\n            <div class=\"row table-responsive list-panel\">\n                <table class=\"table table-striped table-hover table-condensed\">\n                    <thead>\n                        <tr>\n                            <th (click)=\"sortingParam='label'; reversed=!reversed; sortPlates()\">Label</th>\n                            <th (click)=\"sortingParam='date_processed'; reversed=!reversed; sortPlates()\">Date Processed</th>\n                            <th (click)=\"sortingParam='date_run'; reversed=!reversed; sortPlates()\">Date Run</th>\n                            <th (click)=\"sortingParam='ce_machine'; reversed=!reversed; sortPlates()\">CE Machine</th>\n                        </tr>\n                    </thead>\n                    <tbody>\n                        <tr [ngClass]=\"{success: plate.id==selectedPlate?.id}\" *ngFor=\"#plate of plates\" (click)=\"selectPlate(plate.id)\">\n                            <td>{{plate.label}}</td>\n                            <td>{{plate.date_processed | date: \"shortDate\"}}</td>\n                            <td>{{plate.date_run | date: \"shortDate\"}}</td>\n                            <td>{{plate.ce_machine}}</td>\n                        </tr>\n                    </tbody>\n                </table>\n            </div>\n        </div>\n        <div class=\"col-sm-7\">\n            <div class=\"row\">\n                <div *ngIf=\"selectedPlate\">\n                    <pm-d3-plate-detail [plate]=\"selectedPlate\"></pm-d3-plate-detail>\n                </div>  \n            </div>            \n        </div>\n    </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent, d3_plate_detail_component_1.PlateDetailComponent]
                    }), 
                    __metadata('design:paramtypes', [plate_service_1.PlateService, router_1.Router, ladder_service_1.LadderService])
                ], PlateListComponent);
                return PlateListComponent;
            }());
            exports_1("PlateListComponent", PlateListComponent);
        }
    }
});
//# sourceMappingURL=plate-list.component.js.map