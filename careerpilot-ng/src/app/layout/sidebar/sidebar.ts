import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIf } from '@angular/common';
import { UserService } from '../../core/services/user';
import { AuthService } from '../../core/services/auth';

interface NavItem { label: string; icon: string; path: string; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIf],
  templateUrl: './sidebar.html'
})
export class SidebarComponent {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();

  user = inject(UserService).user;
  auth = inject(AuthService);

  nav: NavItem[] = [
    { label: 'Dashboard',    icon: '⌂', path: '/dashboard'    },
    { label: 'Job matches',  icon: '✦', path: '/matches'      },
    { label: 'Applications', icon: '▣', path: '/applications' },
    { label: 'My résumé',    icon: '▤', path: '/resume'       },
    { label: 'Profile',      icon: '◎', path: '/profile'      },
    { label: 'Admin',        icon: '⚙', path: '/admin'        },
  ];

  get avatarInitials(): string {
    const name = this.user()?.name || this.user()?.email || '--';
    return name.slice(0, 2).toUpperCase();
  }

  get completePct(): number {
    const u = this.user(); if (!u) return 0;
    let pct = 0;
    if (u.jobProfiles?.length) pct += 30;
    if (u.resumeFile?.storedName) pct += 30;
    if (u.name) pct += 20;
    if (Object.values(u.portals || {}).some((p: any) => p?.email)) pct += 20;
    return Math.min(100, pct);
  }

  onNavClick() { this.close.emit(); }
  logout()     { this.auth.logout(); }
}
