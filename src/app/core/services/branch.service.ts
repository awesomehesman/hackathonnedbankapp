import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BranchService {
  // default branch per requirements
  private readonly branchSubject = new BehaviorSubject<string>('JHB01');

  readonly branch$ = this.branchSubject.asObservable();

  get current(): string {
    return this.branchSubject.value;
  }

  setBranch(code: string): void {
    if (!code) return;
    this.branchSubject.next(code);
  }
}


