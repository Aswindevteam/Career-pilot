import { Component, OnInit, signal, inject } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { ApplicationService } from '../../core/services/application';
import { Application } from '../../core/models';

@Component({
  selector: 'app-applications',
  standalone: true,
  imports: [UpperCasePipe],
  templateUrl: './applications.html'
})
export class ApplicationsComponent implements OnInit {
  private appSvc = inject(ApplicationService);
  apps    = signal<Application[]>([]);
  loading = signal(true);

  readonly statuses = ['applied','interview','offer','saved'] as const;

  ngOnInit() {
    this.appSvc.getAll().subscribe({ next: a => { this.apps.set(a); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  col(status: string): Application[] {
    return this.apps().filter(a => (a.status === status) || (status === 'applied' && !['interview','offer','saved'].includes(a.status)));
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
}
