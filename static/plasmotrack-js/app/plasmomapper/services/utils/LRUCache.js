System.register([], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var LRUNode, LRUCache;
    return {
        setters:[],
        execute: function() {
            LRUNode = (function () {
                function LRUNode(key, data) {
                    this.key = key;
                    this.data = data;
                }
                return LRUNode;
            }());
            LRUCache = (function () {
                function LRUCache(limit) {
                    if (limit === void 0) { limit = 100000; }
                    this.limit = limit;
                    this.size = 0;
                    this.map = new Map();
                    this.lock = false;
                }
                LRUCache.prototype.setHead = function (node) {
                    //node is already head
                    if (this.head === node) {
                        return;
                    }
                    else if (this.head == null) {
                        this.head = node;
                        this.tail = node;
                    }
                    else {
                        //node is new
                        if (node.next == null && node.prev == null) {
                        }
                        else if (this.tail === node) {
                            this.tail = node.next;
                            this.tail.prev = null;
                        }
                        else {
                            node.prev.next = node.next.prev;
                            node.next = null;
                        }
                        var old_head = this.head;
                        node.prev = old_head;
                        old_head.next = node;
                        node.next = null;
                        this.head = node;
                    }
                };
                LRUCache.prototype.purge = function () {
                    var node = this.head;
                    var last_node = this.tail;
                    var next_to_last_node = this.tail.next;
                    this.tail = next_to_last_node;
                    next_to_last_node.prev = null;
                    this.map.delete(last_node.key);
                    this.size--;
                };
                LRUCache.prototype.has = function (key) {
                    return this.map.has(key);
                };
                LRUCache.prototype.get = function (key) {
                    var node = this.map.get(key);
                    this.setHead(node);
                    return node.data;
                };
                LRUCache.prototype.set = function (key, value) {
                    var node = new LRUNode(key, value);
                    if (this.map.has(key)) {
                        this.remove(key);
                    }
                    this.map.set(node.key, node);
                    this.setHead(node);
                    this.size++;
                    while (this.size >= this.limit) {
                        this.purge();
                    }
                };
                LRUCache.prototype.remove = function (key) {
                    var node = this.map.get(key);
                    //node is floating due to async calls
                    if (node.prev == null && node.next == null) {
                    }
                    else if (this.head === node && this.tail === node) {
                        this.head = null;
                        this.tail = null;
                    }
                    else if (this.head === node) {
                        this.head = node.prev;
                        node.prev.next = null;
                    }
                    else if (this.tail === node) {
                        this.tail = node.next;
                        node.next.prev = null;
                    }
                    else {
                        node.prev.next = node.next;
                        node.next.prev = node.prev;
                        node.next = null;
                        node.prev = null;
                    }
                    this.map.delete(key);
                    this.size--;
                };
                return LRUCache;
            }());
            exports_1("LRUCache", LRUCache);
        }
    }
});
//# sourceMappingURL=LRUCache.js.map