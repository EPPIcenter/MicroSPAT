export abstract class DatabaseItem {
    id: number;
    isDirty: boolean;
    
    abstract fillFromJSON(obj: any): any;
    
    copyFromObj(obj: any) {
        for(let p in obj) {
            if (p === 'id'){
                this[p] = +obj[p];
            } else {
                this[p] = obj[p];
            }
        }
    }
}