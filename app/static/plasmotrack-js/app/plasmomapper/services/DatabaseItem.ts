export abstract class DatabaseItem {
    id: number;
    isDirty: boolean;
    
    abstract fillFromJSON(obj: any): any;
    
    copyFromObj(obj: any) {
        for(let p in obj) {
            this[p] = obj[p];
        }
    }
}