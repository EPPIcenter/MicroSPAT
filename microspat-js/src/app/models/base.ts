export interface BaseModel {
  detailed: boolean;
  stale: boolean;
  last_updated: Date;
  id: string;
}

export abstract class SortableField<T> {
  readonly pprint: string;
  readonly field: string;
  public sorter = (a: T, b: T): number => {
    if (a[this.field] < b[this.field]) {
      return 1;
    } else if (a[this.field] > b[this.field]) {
      return -1;
    } else {
      return 0;
    }
  }
  // constructor(field, pprint) {};

}
