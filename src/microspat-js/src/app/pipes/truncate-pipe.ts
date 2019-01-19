import { Pipe, PipeTransform } from '@angular/core';


@Pipe({name: 'truncate'})
export class TruncateStringPipe implements PipeTransform {
  transform(value: string, length: number): string {
    if (value && value.length > length) {
      return value.slice(0, length) + '...';
    } else {
      return value;
    }
  }
}
