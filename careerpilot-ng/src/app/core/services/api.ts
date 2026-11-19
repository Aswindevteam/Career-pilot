import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  get<T>(path: string) {
    return this.http.get<T>(`${environment.apiUrl}${path}`, { headers: this.headers() });
  }

  post<T>(path: string, body: any = {}) {
    return this.http.post<T>(`${environment.apiUrl}${path}`, body, { headers: this.headers() });
  }

  patch<T>(path: string, body: any) {
    return this.http.patch<T>(`${environment.apiUrl}${path}`, body, { headers: this.headers() });
  }

  delete<T>(path: string) {
    return this.http.delete<T>(`${environment.apiUrl}${path}`, { headers: this.headers() });
  }

  postForm<T>(path: string, fd: FormData) {
    return this.http.post<T>(`${environment.apiUrl}${path}`, fd, {
      headers: { Authorization: 'Bearer ' + (this.auth.getToken() ?? '') }
    });
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (this.auth.getToken() ?? '')
    });
  }

  /** Build a URL with the token in ?t= for direct file links */
  fileUrl(path: string): string {
    return `${environment.apiUrl}${path}?t=${this.auth.getToken()}`;
  }
}
