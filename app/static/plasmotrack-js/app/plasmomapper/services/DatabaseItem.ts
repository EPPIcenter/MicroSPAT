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
