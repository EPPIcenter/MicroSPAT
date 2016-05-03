System.register(['../DatabaseItem', '../channel/channel.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, channel_model_1;
    var Well;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (channel_model_1_1) {
                channel_model_1 = channel_model_1_1;
            }],
        execute: function() {
            Well = (function (_super) {
                __extends(Well, _super);
                function Well() {
                    _super.apply(this, arguments);
                }
                Well.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    if (obj.last_updated != null) {
                        this.last_updated = new Date(obj.last_updated);
                    }
                    var ch = new Map();
                    for (var key in obj.channels) {
                        var new_ch = new channel_model_1.Channel();
                        new_ch.fillFromJSON(obj.channels[key]);
                        ch.set(key, new_ch);
                    }
                    this.channels = ch;
                };
                return Well;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("Well", Well);
        }
    }
});
//# sourceMappingURL=well.model.js.map