import { Component, OnInit, signal, inject } from '@angular/core';
import { ApiService } from '../../core/services/api';
import { ToastService } from '../../core/services/toast';

interface AdminUser { _id: string; name: string; email: string; isAdmin: boolean; }

@Component({
  selector: 'app-admin',
  standalone: true,
  templateUrl: './admin.html'
})
export class AdminComponent implements OnInit {
  private api  = inject(ApiService);
  private toast = inject(ToastService);
  users   = signal<AdminUser[]>([]);
  count   = signal(0);
  loading = signal(true);
  error   = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true); this.error.set('');
    this.api.get<{ count: number; users: AdminUser[] }>('/admin/users').subscribe({
      next: d => { this.count.set(d.count); this.users.set(d.users); this.loading.set(false); },
      error: () => { this.error.set('Admin access required.'); this.loading.set(false); }
    });
  }

  deleteUser(id: string) {
    if (!confirm('Delete this user?')) return;
    this.api.delete(`/admin/users/${id}`).subscribe({
      next: () => { this.toast.show('Deleted'); this.load(); },
      error: e  => this.toast.show(e.error?.error || 'Delete failed')
    });
  }
}
