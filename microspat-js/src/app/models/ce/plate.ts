import { TimeStamped, Flaggable } from '../attributes';
import { BaseModel, SortableField } from '../base';


export interface Plate extends BaseModel, Flaggable {
  label: string;
  creator: string;
  date_processed: Date;
  date_run: Date;
  well_arrangement: 96 | 384;
  ce_machine: string;
  plate_hash: string;
  wells: string[];
  power: number[];
  current: number[];
  voltage: number[];
  temperature: number[];
}

export class SortByLabel extends SortableField<Plate> {
  pprint = 'Label';
  field = 'label';
  // constructor() {};
}

export class SortByCreator extends SortableField<Plate> {
  pprint = 'Creator';
  field = 'creator';
  // constructor() {};
}

export class SortByDateProcessed extends SortableField<Plate> {
  pprint = 'Date Processed';
  field = 'date_processed';
  // constructor() {};
}

export class SortByDateRun extends SortableField<Plate> {
  pprint = 'Date Run';
  field = 'date_run';
  // constructor() {};
}

export class SortByWellArrangement extends SortableField<Plate> {
  pprint = 'Well Arrangement';
  field = 'well_arrangement';
  // constructor() {};
}

export class SortByCEMachine extends SortableField<Plate> {
  pprint = 'CE Machine';
  field = 'ce_machine';
  // constructor() {};
}

export class SortByContamCount extends SortableField<Plate> {
  pprint = 'Contamination Count';
  sorter = (a: Plate, b: Plate) => {
    if (a.flags['contamination_count'] < b.flags['contamination_count']) {
      return 1;
    } else if (a.flags['contamination_count'] > b.flags['contamination_count']) {
      return -1;
    } else {
      return 0;
    }
  }
}


export type SortableFields = SortByLabel
| SortByCreator
| SortByDateProcessed
| SortByDateRun
| SortByWellArrangement
| SortByCEMachine;
