import { Pipe, PipeTransform} from '@angular/core'
import { LocusService } from '../services/locus/locus.service';
import { Observable } from 'rxjs/Observable';

@Pipe({
    name: 'locus'
})
export class LocusPipe implements PipeTransform {
    
    constructor(
        private _locusService: LocusService
    ){}
    
    transform(id: number, fields: string[] = []) {
        let field = fields[0] || 'label';
        if(id) {
            return this._locusService.getLocus(id)
                .map((locus) => {
                    return <string> locus[field]
                })
        } else {
            return Observable.from(['All Loci']);
        } 
    }
}