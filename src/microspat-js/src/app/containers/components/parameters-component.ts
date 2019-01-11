import { FormGroup, FormGroupDirective, FormBuilder } from '@angular/forms';
import { Input, OnChanges, SimpleChanges } from '@angular/core';

export class AbstractParameterComponent implements OnChanges {
  @Input() parameters: any;

  protected parameterValidators: any;
  public form: FormGroup;

  constructor(protected parent: FormGroupDirective, protected fb: FormBuilder, private parameterType: string) {}

  convertParametersToForm(p) {
    const form = Object.keys(this.parameterValidators).reduce((prev, curr) => {
      return Object.assign(prev, {[curr]: [p[curr], this.parameterValidators[curr]]})
    }, {})
    return form;
  }

  getParameterPatch(p) {
    const patch = Object.keys(this.parameterValidators).reduce((prev, curr) => {
      return Object.assign(prev, {[curr]: p[curr]})
    }, {})
    return patch;
  }

  ngOnChanges(c: SimpleChanges) {
    if (c.parameters) {
      if (c.parameters.isFirstChange) {
        this.form = this.parent.form;
        const defaultForm = this.convertParametersToForm(this.parameters);
        this.form.addControl(this.parameterType, this.fb.group(defaultForm));
      }
      const updatedForm = this.getParameterPatch(this.parameters);
      this.form.get(this.parameterType).patchValue(updatedForm);
    }
  }
}
