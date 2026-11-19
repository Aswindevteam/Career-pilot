import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, Subject, Subscription } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from './api';
import { PortalStatus } from '../models';
import { environment } from '../../../environments/environment';

export interface PortalSession {
  status: PortalStatus;
  screenshotUrl: string | null;
  running: boolean;
}

@Injectable({ providedIn: 'root' })
export class AutomationService {
  sessions = signal<Record<string, PortalSession>>({});

  private stops: Record<string, Subject<void>> = {};
  private subs: Record<string, Subscription> = {};

  constructor(private api: ApiService, private http: HttpClient) {}

  start(portal: string) {
    return this.api.post<{ started: boolean; portal: string; pid: number }>(`/automation/run/${portal}`, {});
  }

  startAll() {
    return this.api.post<{ started: boolean; portals: string[] }>('/automation/run', {});
  }

  stop(portal: string) {
    this.stopPolling(portal);
    return this.api.post<{ stopped: boolean }>(`/automation/stop/${portal}`, {});
  }

  stopAll() {
    Object.keys(this.stops).forEach(p => this.stopPolling(p));
    return this.api.post<{ stopped: string[]; count: number }>('/automation/stop', {});
  }

  beginPolling(portal: string, intervalMs = 1500) {
    this.stopPolling(portal);
    const stop$ = new Subject<void>();
    this.stops[portal] = stop$;
    this.updateSession(portal, { running: true });

    this.subs[portal] = interval(intervalMs).pipe(
      takeUntil(stop$),
      switchMap(() => this.api.get<PortalStatus>(`/automation/status/${portal}`))
    ).subscribe(st => {
      this.updateSession(portal, { status: st });
      if (st.step === 'Done' || st.step === 'Stopped' || st.step?.startsWith('Error')) {
        this.stopPolling(portal);
        this.updateSession(portal, { running: false });
      }
    });

    // poll screenshot separately
    this.pollScreenshot(portal, stop$);
  }

  private pollScreenshot(portal: string, stop$: Subject<void>) {
    const sub = interval(2000).pipe(takeUntil(stop$)).subscribe(() => {
      const url = `${environment.apiUrl}/automation/screenshot/${portal}?t=${this.api.fileUrl('').split('?t=')[1]}`;
      this.http.get(url, { responseType: 'blob' }).subscribe({
        next: blob => {
          if (blob.size > 0) {
            const objUrl = URL.createObjectURL(blob);
            this.updateSession(portal, { screenshotUrl: objUrl });
          }
        },
        error: () => {}
      });
    });
  }

  stopPolling(portal: string) {
    this.stops[portal]?.next();
    this.stops[portal]?.complete();
    delete this.stops[portal];
    this.subs[portal]?.unsubscribe();
    delete this.subs[portal];
  }

  getLog(portal: string) {
    return this.api.get<{ lines: string[] }>(`/automation/log/${portal}`);
  }

  loadInitialState(portal: string) {
    return this.api.get<PortalStatus>(`/automation/status/${portal}`);
  }

  private updateSession(portal: string, patch: Partial<PortalSession>) {
    this.sessions.update(s => {
      const existing = s[portal] || { status: { step: 'idle', error: null, ts: 0 }, screenshotUrl: null, running: false };
      return { ...s, [portal]: { ...existing, ...patch } };
    });
  }
}
