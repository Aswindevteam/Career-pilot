import { Component, OnInit, signal, inject } from '@angular/core';
import { JobService } from '../../core/services/job';
import { ToastService } from '../../core/services/toast';
import { Job } from '../../core/models';

@Component({
  selector: 'app-matches',
  standalone: true,
  templateUrl: './matches.html'
})
export class MatchesComponent implements OnInit {
  private jobSvc = inject(JobService);
  toast = inject(ToastService);
  jobs  = signal<Job[]>([]);
  loading = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.jobSvc.getAll().subscribe({
      next: j => { this.jobs.set(j); this.loading.set(false); this.toast.show(j.length + ' matches loaded'); },
      error: () => { this.loading.set(false); this.toast.show('Failed to load matches — is the backend running?'); }
    });
  }

  logoColor(co?: string): string {
    const colors = ['#a67f48','#536f9a','#c66f62','#638e71','#7b6fd4','#d9a94c'];
    let h = 0; for (const c of (co || '')) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
    return colors[Math.abs(h) % colors.length];
  }
}
