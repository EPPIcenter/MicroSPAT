import { Pipe, PipeTransform} from '@angular/core'
import { LocusService } from '../services/locus/locus.service';

@Pipe({
    name: 'locus'
})
export class LocusPipe implements PipeTransform {
    
    constructor(
        private _locusService: LocusService
    ){}
    
    transform(id: number, fields: string[] = []) {
        
        console.log(fields);
        console.log(id);
        let field = fields[0] || 'label';
        return this._locusService.getLocus(id)
                .map((locus) => {
                    console.log(locus);
                    return <string> locus[field]
                })
    }
}