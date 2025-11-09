import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss'
})
export class AuthShellComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  readonly year = new Date().getFullYear();
  readonly isSubmitting = signal(false);
  readonly mode = signal<'login' | 'register'>('login');

  readonly loginForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly registerForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  submitLogin() {
    if (this.loginForm.invalid) return;
    this.isSubmitting.set(true);
    this.auth
      .login(this.loginForm.value as { username: string; password: string })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: error => this.handleError(error, 'Unable to login')
      });
  }

  submitRegister() {
    if (this.registerForm.invalid) return;
    this.isSubmitting.set(true);
    this.auth
      .register(this.registerForm.value as { username: string; password: string })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.snackbar.open('Account ready. Welcome to CredLink Pulse!', 'Go', { duration: 3000 });
          this.router.navigate(['/dashboard']);
        },
        error: error => this.handleError(error, 'Registration failed')
      });
  }

  toggleMode(next: 'login' | 'register') {
    this.mode.set(next);
  }

  private handleError(error: unknown, fallback: string): void {
    const message = (error as { error?: { message?: string } })?.error?.message ?? fallback;
    this.snackbar.open(message, 'Dismiss', { duration: 3500 });
  }
}
