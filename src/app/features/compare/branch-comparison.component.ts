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

interface ComparisonInsightCard {
  title: string;
  badge: 'Momentum' | 'Action';
  summary: string;
  recommendation: string;
  focusBranch: string;
  metrics: Array<{ label: string; primary: string; secondary: string }>;
}

interface ComparisonContext {
  selection: BranchSelection;
  primaryFinal: number;
  secondaryFinal: number;
  primaryGrowth: number;
  secondaryGrowth: number;
  primaryAvg: number;
  secondaryAvg: number;
  primarySwing: number;
  secondarySwing: number;
  leadingKey: 'primary' | 'secondary';
  laggingKey: 'primary' | 'secondary';
  projectedGap: number;
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
  readonly comparisonInsights = signal<ComparisonInsightCard[]>([]);
  readonly isLoading = signal(false);

  readonly selected = computed(() => this.selectionState());
  private scenarioIndex = 0;

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
        tap(value => {
          const previous = this.selectionState();
          const nextSelection = {
            primary: value.primary ?? 'JHB01',
            secondary: value.secondary ?? 'DBN01',
            horizon: value.horizon ?? 14
          };
          this.selectionState.set(nextSelection);
          const branchChanged =
            previous.primary !== nextSelection.primary || previous.secondary !== nextSelection.secondary;
          if (branchChanged) {
            this.scenarioIndex = (this.scenarioIndex + 1) % 2;
          }
        }),
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
      .subscribe(result => {
        this.comparison.set(result);
        this.populateInsights();
      });
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

  private populateInsights(): void {
    const context = this.buildComparisonContext();
    if (!context) {
      this.comparisonInsights.set([]);
      return;
    }

    const builders = [this.buildTrajectoryInsights.bind(this), this.buildEfficiencyInsights.bind(this)];
    const builder = builders[this.scenarioIndex] ?? builders[0];
    this.comparisonInsights.set(builder(context));
  }

  private buildComparisonContext(): ComparisonContext | null {
    const { primary, secondary } = this.comparison();
    const selection = this.selectionState();
    if (!primary || !secondary || primary.points.length === 0 || secondary.points.length === 0) {
      return null;
    }

    const primaryFinal = primary.points.at(-1)?.projectedBalance ?? primary.startingBalance ?? 0;
    const secondaryFinal = secondary.points.at(-1)?.projectedBalance ?? secondary.startingBalance ?? 0;
    const primaryStart = primary.points.at(0)?.projectedBalance ?? primary.startingBalance ?? 0;
    const secondaryStart = secondary.points.at(0)?.projectedBalance ?? secondary.startingBalance ?? 0;

    const primaryGrowth = this.safeGrowth(primaryStart, primaryFinal);
    const secondaryGrowth = this.safeGrowth(secondaryStart, secondaryFinal);
    const primaryAvg = this.averageBalance(primary.points);
    const secondaryAvg = this.averageBalance(secondary.points);
    const primarySwing = this.balanceSwing(primary.points, primaryAvg);
    const secondarySwing = this.balanceSwing(secondary.points, secondaryAvg);
    const leadingKey = primaryFinal >= secondaryFinal ? 'primary' : 'secondary';
    const laggingKey = leadingKey === 'primary' ? 'secondary' : 'primary';

    return {
      selection,
      primaryFinal,
      secondaryFinal,
      primaryGrowth,
      secondaryGrowth,
      primaryAvg,
      secondaryAvg,
      primarySwing,
      secondarySwing,
      leadingKey,
      laggingKey,
      projectedGap: Math.abs(primaryFinal - secondaryFinal)
    };
  }

  private buildTrajectoryInsights(context: ComparisonContext): ComparisonInsightCard[] {
    const leadingFinal = context.leadingKey === 'primary' ? context.primaryFinal : context.secondaryFinal;
    const laggingFinal = context.laggingKey === 'primary' ? context.primaryFinal : context.secondaryFinal;
    const leadingGrowth = context.leadingKey === 'primary' ? context.primaryGrowth : context.secondaryGrowth;
    const laggingGrowth = context.laggingKey === 'primary' ? context.primaryGrowth : context.secondaryGrowth;
    const leadingName =
      context.leadingKey === 'primary' ? context.selection.primary : context.selection.secondary;
    const laggingName =
      context.laggingKey === 'primary' ? context.selection.primary : context.selection.secondary;

    return [
      {
        title: 'Balance trajectory gap',
        badge: 'Momentum',
        summary: `${leadingName} ends the ${context.selection.horizon}-day outlook ${this.formatCurrency(
          context.projectedGap
        )} ahead with ${this.formatPercent(leadingGrowth)} growth vs ${this.formatPercent(laggingGrowth)} for ${laggingName}.`,
        recommendation: `${laggingName} should accelerate collections by pulling forward high-value settlements and mirror ${leadingName}'s early-week inflow pattern.`,
        focusBranch: laggingName,
        metrics: [
          {
            label: 'Projected close',
            primary: this.formatCurrency(context.primaryFinal),
            secondary: this.formatCurrency(context.secondaryFinal)
          },
          {
            label: 'Growth over horizon',
            primary: this.formatPercent(context.primaryGrowth),
            secondary: this.formatPercent(context.secondaryGrowth)
          }
        ]
      },
      {
        title: 'Volatility watch',
        badge: 'Action',
        summary: `${laggingName} shows ${this.formatPercent(
          context.laggingKey === 'primary' ? context.primarySwing : context.secondarySwing
        )} swing in daily balances, nearly ${this.formatPercent(
          context.leadingKey === 'primary' ? context.primarySwing : context.secondarySwing
        )} at ${leadingName}.`,
        recommendation: `Stagger payouts and route 20% of marketplace disbursements through a later window to calm balance swings at ${laggingName}.`,
        focusBranch: laggingName,
        metrics: [
          {
            label: 'Avg balance',
            primary: this.formatCurrency(context.primaryAvg),
            secondary: this.formatCurrency(context.secondaryAvg)
          },
          {
            label: 'Intra-horizon swing',
            primary: this.formatPercent(context.primarySwing),
            secondary: this.formatPercent(context.secondarySwing)
          }
        ]
      }
    ];
  }

  private buildEfficiencyInsights(context: ComparisonContext): ComparisonInsightCard[] {
    const laggingName =
      context.laggingKey === 'primary' ? context.selection.primary : context.selection.secondary;
    const leadingName =
      context.leadingKey === 'primary' ? context.selection.primary : context.selection.secondary;
    const laggingAvg = context.laggingKey === 'primary' ? context.primaryAvg : context.secondaryAvg;
    const leadingAvg = context.leadingKey === 'primary' ? context.primaryAvg : context.secondaryAvg;

    return [
      {
        title: 'Cash productivity',
        badge: 'Momentum',
        summary: `${leadingName} circulates cash more efficiently, keeping average balances ${this.formatCurrency(
          Math.abs(leadingAvg - laggingAvg)
        )} higher while still compounding gains.`,
        recommendation: `${laggingName} should lift card-present sales pushes during peak trading blocks and bundle FX customers to widen inflows.`,
        focusBranch: laggingName,
        metrics: [
          {
            label: 'Avg balance',
            primary: this.formatCurrency(context.primaryAvg),
            secondary: this.formatCurrency(context.secondaryAvg)
          },
          {
            label: 'Projected gap',
            primary:
              context.leadingKey === 'primary'
                ? this.formatCurrency(context.projectedGap)
                : this.formatCurrency(-context.projectedGap),
            secondary:
              context.leadingKey === 'secondary'
                ? this.formatCurrency(context.projectedGap)
                : this.formatCurrency(-context.projectedGap)
          }
        ]
      },
      {
        title: 'Stability levers',
        badge: 'Action',
        summary: `${laggingName} still carries ${this.formatPercent(
          context.laggingKey === 'primary' ? context.primarySwing : context.secondarySwing
        )} balance variance, leaving less room for surprise payouts.`,
        recommendation: `Freeze non-critical capex for one cycle and redirect released liquidity into receivables discounting to improve ${laggingName}'s buffer.`,
        focusBranch: laggingName,
        metrics: [
          {
            label: 'Variance vs avg',
            primary: this.formatPercent(context.primarySwing),
            secondary: this.formatPercent(context.secondarySwing)
          },
          {
            label: 'Horizon growth',
            primary: this.formatPercent(context.primaryGrowth),
            secondary: this.formatPercent(context.secondaryGrowth)
          }
        ]
      }
    ];
  }

  private safeGrowth(start: number, end: number): number {
    if (start === 0) {
      return 0;
    }
    return (end - start) / Math.abs(start);
  }

  private averageBalance(points: { projectedBalance: number }[]): number {
    if (!points.length) return 0;
    const total = points.reduce((sum, point) => sum + point.projectedBalance, 0);
    return total / points.length;
  }

  private balanceSwing(points: { projectedBalance: number }[], average: number): number {
    if (!points.length || average === 0) return 0;
    const values = points.map(point => point.projectedBalance);
    const max = Math.max(...values);
    const min = Math.min(...values);
    return (max - min) / Math.abs(average);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }
}
