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

export abstract class DatabaseItem {
    id: number;
    isDirty: boolean;
    _global_id: number;
    static count: number = 1;

    constructor(obj?) {
        if(obj) {
            this.copyFromObj(obj);
        }
        this._global_id = DatabaseItem.count
        DatabaseItem.count++;
    }
    
    fillFromJSON(obj: any) {
        for(let p in obj) {
            this['__' + p] = obj[p];
            this['_' + p] = obj[p];
            Object.defineProperty(this, p, {
                enumerable: true,
                get: () => {
                    return this['_' + p];
                },
                set: (val) => {
                    if(val !== this['__' + p]) {
                        this.isDirty = true;
                    } else {
                        this.isDirty = false;
                    }
                    this['_' + p] = val;
                }
            })
        }
    }

    restore() {
        let keys = Object.keys(this).filter((k) => {
            return k.startsWith('__');
        })

        keys.forEach((key) => {
            let prop = key.slice(2);
            this[prop] = this[key];
        })

        return this;
    }

    toJSON() {
        let obj = {};
        let keys = Object.keys(this).filter((k) => {
            return !(k.startsWith('_'));
        })

        keys.forEach((k) => {
            obj[k] = this[k];
        });

        return JSON.stringify(obj);
    }
    
    copyFromObj(obj: any) {
        // for(let p in obj) {
        //     if (p === 'id'){
        //         this[p] = +obj[p];
        //     } else {
        //         this[p] = obj[p];
        //     }
        // }
        for(let p in obj) {
            if(p === 'id') {
                obj[p] = +obj[p];
            }
            this['__' + p] = obj[p];
            this['_' + p] = obj[p];
            Object.defineProperty(this, p, {
                enumerable: true,
                get: () => {
                    return this['_' + p];
                },
                set: (val) => {
                    if(val !== this['__' + p]) {
                        this.isDirty = true;
                    } else {
                        this.isDirty = false;
                    }
                    this['_' + p] = val;
                }
            })
        }
    }
}
