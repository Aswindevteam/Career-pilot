import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TitleCasePipe, UpperCasePipe, DecimalPipe } from '@angular/common';
import { UserService } from '../../core/services/user';
import { ApplicationService } from '../../core/services/application';
import { AutomationService } from '../../core/services/automation';
import { ToastService } from '../../core/services/toast';
import { Application, User } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, TitleCasePipe, UpperCasePipe, DecimalPipe],
  templateUrl: './dashboard.html'
})
export class DashboardComponent implements OnInit {
  userSvc  = inject(UserService);
  appSvc   = inject(ApplicationService);
  autoSvc  = inject(AutomationService);
  toast    = inject(ToastService);

  user     = this.userSvc.user;
  sessions = this.autoSvc.sessions;

  apps     = signal<Application[]>([]);
  loading  = signal(true);

  get applied()    { return this.apps().length; }
  get interviews() { return this.apps().filter(a => a.status === 'interview').length; }
  get offers()     { return this.apps().filter(a => a.status === 'offer').length; }
  get rejected()   { return this.apps().filter(a => a.status === 'rejected').length; }

  get enabledPortals(): string[] {
    const p = this.user()?.portals || {};
    return Object.keys(p).filter(k => (p as any)[k]?.email);
  }

  get greeting(): string {
    const h = new Date().getHours();
    const name = this.user()?.name || 'there';
    return (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + ', ' + name + ' 👋';
  }

  get todayDate(): string {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  }

  get funnelBase() { return this.applied || 1; }
  funnelPct(n: number) { return Math.round((n / this.funnelBase) * 100); }

  get byPortal(): { portal: string; count: number }[] {
    const map: Record<string, number> = {};
    this.apps().forEach(a => { const p = a.portal || 'other'; map[p] = (map[p] || 0) + 1; });
    return Object.entries(map).map(([portal, count]) => ({ portal, count }))
      .sort((a, b) => b.count - a.count);
  }

  get portalMax(): number { return this.byPortal[0]?.count || 1; }

  get kanbanCols() {
    const cols: Record<string, Application[]> = { applied: [], interview: [], offer: [], saved: [] };
    this.apps().forEach(a => { const k = cols[a.status] ? a.status : 'applied'; cols[k].push(a); });
    return Object.entries(cols).map(([status, items]) => ({ status, items }));
  }

  ngOnInit() {
    if (!this.user()) this.userSvc.load().subscribe();
    this.appSvc.getAll().subscribe({ next: a => { this.apps.set(a); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  startPortal(portal: string) {
    this.autoSvc.start(portal).subscribe({
      next: () => { this.toast.show(`${portal} auto-apply started`); this.autoSvc.beginPolling(portal); },
      error: e  => this.toast.show(e.error?.error || `${portal} failed to start`)
    });
  }

  stopPortal(portal: string) {
    this.autoSvc.stop(portal).subscribe({ next: () => this.toast.show(`${portal} stopped`), error: () => {} });
  }

  stopAll() {
    this.autoSvc.stopAll().subscribe({ next: r => this.toast.show(`Stopped ${r.count} portals`), error: () => {} });
  }

  startAll() {
    this.autoSvc.startAll().subscribe({
      next: r => { this.toast.show('Auto-apply started'); (r.portals || []).forEach(p => this.autoSvc.beginPolling(p)); },
      error: e => this.toast.show(e.error?.error || 'Failed to start')
    });
  }

  portalDotClass(portal: string): string {
    const s = this.sessions()[portal];
    if (!s) return 'aa-portal-dot';
    if (s.running) return 'aa-portal-dot running';
    const step = s.status?.step || '';
    if (step === 'Done') return 'aa-portal-dot done';
    if (step?.startsWith('Error')) return 'aa-portal-dot error';
    return 'aa-portal-dot';
  }

  portalStatus(portal: string): string {
    const s = this.sessions()[portal];
    if (!s || !s.status?.step || s.status.step === 'idle') return 'Idle';
    return s.status.step;
  }

  isPortalRunning(portal: string): boolean {
    return !!this.sessions()[portal]?.running;
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  logoColor(co?: string): string {
    const colors = ['#a67f48','#536f9a','#c66f62','#638e71','#7b6fd4','#d9a94c'];
    let h = 0; for (const c of (co || '')) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
    return colors[Math.abs(h) % colors.length];
  }
}
