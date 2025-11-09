import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);

  if (!auth.isAuthenticated()) {
    auth.logout();
    return false;
  }

  return true;
};
