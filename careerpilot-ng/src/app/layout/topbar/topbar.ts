import { Component, Output, EventEmitter, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-topbar',
  standalone: true,
  templateUrl: './topbar.html'
})
export class TopbarComponent {
  @Output() menuToggle = new EventEmitter<void>();
  private auth = inject(AuthService);

  logout() {
    if (confirm('Log out?')) this.auth.logout();
  }
}
