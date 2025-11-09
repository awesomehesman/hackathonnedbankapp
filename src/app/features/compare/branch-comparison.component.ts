import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, debounceTime, finalize, startWith, switchMap, tap } from 'rxjs/operators';
import { CashflowApiService } from '../../core/services/cashflow-api.service';
import { ForecastResponseDto } from '../../core/models/api.models';
import { BranchService } from '../../core/services/branch.service';
import { BRANCH_CODES } from '../../core/constants/branches';

interface BranchSelection {
  primary: string;
  secondary: string;
  horizon: number;
}

interface ComparisonResult {
  primary: ForecastResponseDto | null;
  secondary: ForecastResponseDto | null;
}

@Component({
  selector: 'app-branch-comparison',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './branch-comparison.component.html',
  styleUrl: './branch-comparison.component.scss'
})
export class BranchComparisonComponent {
  private readonly api = inject(CashflowApiService);
  private readonly fb = inject(FormBuilder);
  private readonly branch = inject(BranchService);

  readonly palette = {
    primary: '#0fb389',
    secondary: '#1d4ed8'
  };

  readonly branchList = BRANCH_CODES;
  readonly branch$ = this.branch.branch$;
  readonly branchOptions = BRANCH_CODES;

  readonly compareForm = this.fb.nonNullable.group({
    primary: ['JHB01'],
    secondary: ['DBN01'],
    horizon: [14]
  });

  private readonly selectionState = signal<BranchSelection>(this.compareForm.getRawValue());
  private readonly comparison = signal<ComparisonResult>({ primary: null, secondary: null });
  readonly isLoading = signal(false);

  readonly selected = computed(() => this.selectionState());

  readonly chartData = computed(() => {
    const { primary, secondary } = this.comparison();
    if (!primary || !secondary || primary.points.length === 0 || secondary.points.length === 0) {
      return null;
    }

    const combined = [...primary.points, ...secondary.points];
    const projections = combined.map(point => point.projectedBalance);
    if (!projections.length) {
      return null;
    }

    const min = Math.min(...projections);
    const max = Math.max(...projections);
    return {
      primaryPath: this.buildLinePath(primary.points, min, max),
      secondaryPath: this.buildLinePath(secondary.points, min, max),
      primary,
      secondary
    };
  });

  readonly pieData = computed(() => {
    const { primary, secondary } = this.comparison();
    if (!primary || !secondary) {
      return null;
    }

    const balances = [
      {
        label: this.selectionState().primary,
        value: primary.startingBalance ?? 0,
        color: this.palette.primary
      },
      {
        label: this.selectionState().secondary,
        value: secondary.startingBalance ?? 0,
        color: this.palette.secondary
      }
    ];

    const total = balances.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
    let cursor = 0;
    const segments: string[] = [];
    const slices = balances.map(item => {
      const fraction = Math.max(0, item.value) / total;
      const percentage = fraction * 100;
      const start = cursor * 360;
      const sweep = fraction * 360;
      const end = start + sweep;
      cursor += fraction;
      segments.push(`${item.color} ${start}deg ${end}deg`);
      return {
        ...item,
        percentage: Number(percentage.toFixed(1))
      };
    });

    return {
      slices,
      background: `conic-gradient(${segments.join(', ')})`
    };
  });

  constructor() {
    this.observeSelections();
  }

  setBranch(code: string): void {
    this.branch.setBranch(code);
  }

  private observeSelections(): void {
    this.compareForm.valueChanges
      .pipe(
        startWith(this.compareForm.getRawValue()),
        tap(value =>
          this.selectionState.set({
            primary: value.primary ?? 'JHB01',
            secondary: value.secondary ?? 'DBN01',
            horizon: value.horizon ?? 14
          })
        ),
        debounceTime(150),
        switchMap(value => {
          const selection: BranchSelection = {
            primary: value.primary ?? 'JHB01',
            secondary: value.secondary ?? 'DBN01',
            horizon: value.horizon ?? 14
          };

          if (!selection.primary || !selection.secondary) {
            return of({ primary: null, secondary: null });
          }

          this.isLoading.set(true);
          return forkJoin({
            primary: this.api.getForecast(selection.primary, selection.horizon).pipe(catchError(() => of(null))),
            secondary: this.api.getForecast(selection.secondary, selection.horizon).pipe(catchError(() => of(null)))
          }).pipe(finalize(() => this.isLoading.set(false)));
        }),
        takeUntilDestroyed()
      )
      .subscribe(result => this.comparison.set(result));
  }

  trackByIndex = (_: number, item: unknown) => item;

  private buildLinePath(points: { projectedBalance: number }[], min: number, max: number): string {
    if (!points.length) return '';
    const range = Math.max(max - min, 1);
    return points
      .map((point, index) => {
        const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
        const y = 100 - ((point.projectedBalance - min) / range) * 100;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }
}
