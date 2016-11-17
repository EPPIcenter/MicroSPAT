// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

interface ForEachFn<T> {
    (node: LRUNode<T>, i: number, cache: LRUCache<T>) : void
}

class LRUNode<T> {
    newer: LRUNode<T>
    older: LRUNode<T>
    
    constructor(public key: number, public value: T){}
    
}

export class LRUCache<T> {
    private size = 0;
    private _map: {[s: string]: LRUNode<T>} = {};
    private head: LRUNode<T>;
    private tail: LRUNode<T>;


    constructor(private limit: number = 10000){};

    public put(key: number, value: T) {
        let entry = new LRUNode(key, value);
        this._map[key] = entry;
        if(this.tail) {
            this.tail.newer = entry;
            entry.older = this.tail;
        } else {
            this.head = entry;
        }

        this.tail = entry;
        if(this.size === this.limit) {
            return this.shift();
        } else {
            this.size++;
        }
    }

    public shift() {
        var entry = this.head;
        if(entry) {
            if(this.head.newer) {
                this.head = this.head.newer;
                this.head.older = undefined;
            } else {
                this.head = undefined;
            }

            entry.newer = entry.older = undefined;

            delete this._map[entry.key];
        }

        return entry;
    }

    public get(key: number, returnEntry?: boolean) {
        let entry = this._map[key];

        if(entry === undefined) return;

        if(entry === this.tail) {
            return returnEntry ? entry : entry.value;
        }

        if(entry.newer) {
            if(entry === this.head) {
                this.head = entry.newer;
            }
            entry.newer.older = entry.older;
        }
        if (entry.older) {
            entry.older.newer = entry.newer;
        }
        entry.newer = undefined;
        entry.older = this.tail;
        if(this.tail) {
            this.tail.newer = entry;
        } this.tail = entry;
        return returnEntry ? entry : entry.value;
    }

    public find(key: number) {
        return this._map[key];
    }

    public set(key: number, value: T) {
        let oldvalue, entry = <LRUNode<T>> this.get(key, true);
        if(entry){
            oldvalue = entry.value;
            entry.value = value;
        } else {
            oldvalue = this.put(key, value);
            if(oldvalue) {
                oldvalue = oldvalue.value;
            }
        }
        return oldvalue;
    }

    public remove(key: number) {
        let entry = this._map[key];
        if(!entry) return;

        delete this._map[entry.key];

        if(entry.newer && entry.older) {
            entry.older.newer = entry.newer;
            entry.newer.older
        } else if (entry.newer) {
            entry.newer.older = undefined;
            this.head = entry.newer;
        } else if (entry.older) {
            entry.older.newer = undefined;
            this.tail = entry.older;
        } else {
            this.head = this.tail = undefined;
        }

        this.size--;
        return entry.value;
    }

    public removeAll() {
        this.head = this.tail = undefined;
        this.size = 0;
        this._map = {};
    }

    public forEach(fun: (number, T, LRUCache) => any, context?: Object) {
        let entry = this.tail;

        if(typeof context !== 'object') {
            context = this;
        }

        while(entry) {
            fun.call(context, entry.key, entry.value, this);
            entry = entry.older;
        }

    }


}