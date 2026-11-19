import { Injectable, signal } from '@angular/core';
import { ApiService } from './api';
import { User, JobProfile } from '../models';
import { tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class UserService {
  user = signal<User | null>(null);

  constructor(private api: ApiService) {}

  load() {
    return this.api.get<User>('/users/me').pipe(tap(u => this.user.set(u)));
  }

  patch(body: Partial<User>) {
    return this.api.patch<User>('/users/me', body).pipe(tap(u => this.user.set(u)));
  }

  addJobProfile(profile: Partial<JobProfile>) {
    return this.api.post<JobProfile[]>('/users/me/job-profiles', profile)
      .pipe(tap(profiles => this.user.update(u => u ? { ...u, jobProfiles: profiles } : u)));
  }

  updateJobProfile(id: string, body: Partial<JobProfile>) {
    return this.api.patch<JobProfile[]>(`/users/me/job-profiles/${id}`, body)
      .pipe(tap(profiles => this.user.update(u => u ? { ...u, jobProfiles: profiles } : u)));
  }

  deleteJobProfile(id: string) {
    return this.api.delete<JobProfile[]>(`/users/me/job-profiles/${id}`)
      .pipe(tap(profiles => this.user.update(u => u ? { ...u, jobProfiles: profiles } : u)));
  }

  uploadResume(file: File) {
    const fd = new FormData();
    fd.append('resume', file);
    return this.api.postForm<{ ok: boolean; resumeFile: User['resumeFile'] }>('/users/me/resume', fd)
      .pipe(tap(res => this.user.update(u => u ? { ...u, resumeFile: res.resumeFile } : u)));
  }

  parseResume(file: File) {
    const fd = new FormData();
    fd.append('resume', file);
    return this.api.postForm<{ name: string; email: string; role: string; skills: string[]; cities: string[] }>('/users/parse-resume', fd);
  }
}
