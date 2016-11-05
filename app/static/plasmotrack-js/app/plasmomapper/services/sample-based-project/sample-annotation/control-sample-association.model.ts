import { DatabaseItem } from '../../DatabaseItem';
import { TimeStamped } from '../../TimeStamped';

import { Control } from '../../control/control.model';

export class ControlSampleAssociation extends DatabaseItem implements TimeStamped {
    control: Control;
    proportion: number;
    last_updated: Date
}