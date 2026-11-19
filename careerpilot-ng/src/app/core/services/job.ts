import { Injectable } from '@angular/core';
import { ApiService } from './api';
import { Job } from '../models';

@Injectable({ providedIn: 'root' })
export class JobService {
  constructor(private api: ApiService) {}
  getAll() { return this.api.get<Job[]>('/jobs'); }
  create(job: Partial<Job>) { return this.api.post<Job>('/jobs', job); }
}
