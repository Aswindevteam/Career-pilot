import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent) },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',     loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardComponent) },
      { path: 'matches',       loadComponent: () => import('./pages/matches/matches').then(m => m.MatchesComponent) },
      { path: 'applications',  loadComponent: () => import('./pages/applications/applications').then(m => m.ApplicationsComponent) },
      { path: 'resume',        loadComponent: () => import('./pages/resume/resume').then(m => m.ResumeComponent) },
      { path: 'profile',       loadComponent: () => import('./pages/profile/profile').then(m => m.ProfileComponent) },
      { path: 'admin',         loadComponent: () => import('./pages/admin/admin').then(m => m.AdminComponent) },
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
