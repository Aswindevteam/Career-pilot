import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { UserService } from '../../core/services/user';
import { ToastService } from '../../core/services/toast';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html'
})
export class LoginComponent {
  mode = signal<Mode>('login');

  email = ''; password = ''; name = ''; role = ''; confirm = '';
  loading = signal(false);

  private auth   = inject(AuthService);
  private user   = inject(UserService);
  private toast  = inject(ToastService);
  private router = inject(Router);

  setMode(m: Mode) { this.mode.set(m); }

  submit() {
    if (this.mode() === 'login') this.doLogin();
    else this.doRegister();
  }

  private doLogin() {
    if (!this.email || !this.password) { this.toast.show('Enter email and password'); return; }
    this.loading.set(true);
    this.auth.login(this.email, this.password).subscribe({
      next: res => { this.user.load().subscribe(); this.router.navigate(['/dashboard']); },
      error: e  => { this.toast.show(e.error?.error || 'Login failed'); this.loading.set(false); }
    });
  }

  private doRegister() {
    if (!this.email || !this.password) { this.toast.show('Email and password required'); return; }
    if (this.password !== this.confirm) { this.toast.show('Passwords do not match'); return; }
    this.loading.set(true);
    this.auth.register(this.email, this.password, this.name || this.email.split('@')[0]).subscribe({
      next: () => { this.user.load().subscribe(); this.router.navigate(['/dashboard']); },
      error: e => { this.toast.show(e.error?.error || 'Register failed'); this.loading.set(false); }
    });
  }
}
