System.register(['../../DatabaseItem'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1;
    var ChannelAnnotation;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            }],
        execute: function() {
            ChannelAnnotation = (function (_super) {
                __extends(ChannelAnnotation, _super);
                function ChannelAnnotation() {
                    _super.apply(this, arguments);
                }
                ChannelAnnotation.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                };
                return ChannelAnnotation;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("ChannelAnnotation", ChannelAnnotation);
        }
    }
});
//# sourceMappingURL=channel-annotation.model.js.map