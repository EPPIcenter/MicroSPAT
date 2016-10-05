import { Injectable } from '@angular/core';
import { Http, Response } from '@angular/http';
import { API_BASE } from '../../api';
import { Observable } from 'rxjs/Observable';

import { LRUCache } from '../utils/LRUCache';
import { CommonServerMethods } from '../utils/ServerMethods';

import { Control } from './control.model';

@Injectable()
export class ControlService {
    public getControls: () => Observable<Control[]>;
    public getControl: (id: number) => Observable<Control>;
    public updateControl: (ctrl: Control) => Observable<Control>;

    private _controlsUrl = API_BASE + "/control/";
    private _controlCache = new LRUCache<Control>(100);

    constructor(private _commonServerMethods: CommonServerMethods) {
        this.getControls = () => this._commonServerMethods.getList(Control, this._controlsUrl);

        this.getControl = (id: number) => this._commonServerMethods.getDetails(id, Control, this._controlsUrl, this._controlCache);
        this.updateControl = (ctrl: Control) => this._commonServerMethods.updateItem(ctrl, Control, this._controlsUrl, this._controlCache);
    }
    
}