import { Pipe, PipeTransform } from 'angular2/core';

@Pipe({
    name: 'capitalize'
})
export class CapitalizePipe implements PipeTransform {
    transform(label: string) {
        return label[0].toLocaleUpperCase() + label.slice(1, label.length);
    }
}