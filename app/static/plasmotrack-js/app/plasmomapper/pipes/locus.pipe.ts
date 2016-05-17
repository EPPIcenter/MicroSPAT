import { Pipe, PipeTransform} from 'angular2/core'
import { LocusService } from '../services/locus/locus.service';

@Pipe({
    name: 'locus'
})
export class LocusPipe implements PipeTransform {
    
    constructor(
        private _locusService: LocusService
    ){}
    
    transform(id: number, fields: string[]) {
        let field = fields[0];
        return this._locusService.getLocus(id)
                .map((locus) => {
                    return <string> locus[field || 'label']
                })
    }
}