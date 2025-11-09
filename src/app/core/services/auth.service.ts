import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponseDto } from '../models/api.models';

export interface AuthCredentials {
  username: string;
  password: string;
}

interface AuthState {
  username: string;
  token: string;
  expiresAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'credlink-auth-state';
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly state = signal<AuthState | null>(this.restoreState());

  readonly user = computed(() => this.state()?.username ?? null);
  readonly isAuthenticatedSignal = computed(() => this.hasValidSession(this.state()));

  constructor(private readonly http: HttpClient, private readonly router: Router) {}

  login(credentials: AuthCredentials): Observable<AuthResponseDto> {
    return this.http
      .post<AuthResponseDto>(`${this.baseUrl}/auth/login`, credentials)
      .pipe(tap(response => this.persistState(response)));
  }

  register(credentials: AuthCredentials): Observable<AuthResponseDto> {
    return this.http
      .post<AuthResponseDto>(`${this.baseUrl}/auth/register`, credentials)
      .pipe(tap(response => this.persistState(response)));
  }

  logout(): void {
    this.state.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.storageKey);
    }
    this.router.navigate(['/auth']);
  }

  getToken(): string | null {
    return this.state()?.token ?? null;
  }

  isAuthenticated(): boolean {
    return this.hasValidSession(this.state());
  }

  private persistState(response: AuthResponseDto): void {
    const authState: AuthState = {
      username: response.username,
      token: response.token,
      expiresAtUtc: response.expiresAtUtc
    };

    this.state.set(authState);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify(authState));
    }
  }

  private restoreState(): AuthState | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as AuthState;
      return this.hasValidSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private hasValidSession(state: AuthState | null): boolean {
    if (!state) return false;
    const expiry = Date.parse(state.expiresAtUtc);
    return Number.isFinite(expiry) && expiry > Date.now();
  }
}
