import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'cp_token';
  isLoggedIn = signal(this.hasToken());

  constructor(private http: HttpClient, private router: Router) {}

  hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http.post<{ token: string; user: any }>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap(res => { localStorage.setItem(this.TOKEN_KEY, res.token); this.isLoggedIn.set(true); }));
  }

  register(email: string, password: string, name: string) {
    return this.http.post<{ token: string; user: any }>(`${environment.apiUrl}/auth/register`, { email, password, name })
      .pipe(tap(res => { localStorage.setItem(this.TOKEN_KEY, res.token); this.isLoggedIn.set(true); }));
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }
}
