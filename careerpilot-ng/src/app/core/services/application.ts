import { Injectable } from '@angular/core';
import { ApiService } from './api';
import { Application } from '../models';

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  constructor(private api: ApiService) {}
  getAll() { return this.api.get<Application[]>('/applications'); }
  update(id: string, body: Partial<Application>) { return this.api.patch<Application>(`/applications/${id}`, body); }
}
