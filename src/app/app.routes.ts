import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard'
  },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth-shell.component').then(m => m.AuthShellComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'compare',
    canActivate: [authGuard],
    loadComponent: () => import('./features/compare/branch-comparison.component').then(m => m.BranchComparisonComponent)
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
