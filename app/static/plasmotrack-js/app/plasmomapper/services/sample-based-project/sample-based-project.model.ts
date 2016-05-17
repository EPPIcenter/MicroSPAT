import { Project } from '../project/project.model';
import { SampleAnnotation } from './sample-annotation/sample-annotation.model';

export class SampleBasedProject extends Project {
    sample_annotations: Map<number, SampleAnnotation>;
    
    fillFromJSON(obj) {
        super.fillFromJSON(obj);
        if(obj.sample_annotations != null) {
            let sa = new Map<number, SampleAnnotation>();
            for(let key in obj.sample_annotations) {
                let new_sa = new SampleAnnotation();
                new_sa.fillFromJSON(obj.sample_annotations[key]);
                sa.set(parseInt(key), new_sa);
            }
            this.sample_annotations = sa;
        }
        // let c = <Object[]> obj.sample_annotations;
        // this.sample_annotations = c.map((obj) => {
        //     let new_obj = new SampleAnnotation();
        //     new_obj.fillFromJSON(obj);
        //     return new_obj;
        // })
    }
}