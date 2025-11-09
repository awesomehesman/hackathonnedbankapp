import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { catchError, debounceTime, startWith, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { CashflowApiService } from '../../core/services/cashflow-api.service';
import { BranchService } from '../../core/services/branch.service';
import { BRANCH_CODES } from '../../core/constants/branches';
import { DailyCashflowSummaryDto, ForecastResponseDto, TransactionDto } from '../../core/models/api.models';
import {
  DriverBreakdown,
  ForecastPoint,
  InsightCard,
  NextBestAction,
  SummaryMetric,
  Warning
} from '../../core/models/forecast.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(CashflowApiService);
  private readonly fb = inject(FormBuilder);
  private readonly branch = inject(BranchService);
  // alias used by existing loading methods
  private readonly accountCode$ = this.branch.branch$;

  // expose observable for template bindings
  readonly branch$ = this.branch.branch$;

  // list of available branches for UI
  readonly branchList = BRANCH_CODES;

  readonly user = this.auth.user;
  private readonly transactions = signal<TransactionDto[]>([]);
  private readonly summary = signal<DailyCashflowSummaryDto[]>([]);
  private readonly forecastResponse = signal<ForecastResponseDto | null>(null);
  readonly insights = signal<InsightCard[]>([]);
  readonly actions = signal<NextBestAction[]>([]);
  readonly alerts = signal<Warning[]>([]);
  readonly simulation = signal<SimulationState>(defaultSimulationState);

  readonly forecast = computed<ForecastPoint[]>(() => {
    const response = this.forecastResponse();
    if (!response) return [];
    return response.points.map(point => ({
      date: point.date,
      projected: point.projectedBalance,
      low: point.confidenceLow,
      high: point.confidenceHigh
    }));
  });

  readonly metrics = computed<SummaryMetric[]>(() =>
    this.buildMetrics(this.transactions(), this.forecastResponse(), this.summary())
  );

  readonly drivers = computed<DriverBreakdown[]>(() => this.buildDrivers(this.transactions()));

  readonly simulationForm = this.fb.nonNullable.group({
    inflowDelta: [6],
    outflowDelta: [2],
    horizon: [14]
  });

  readonly chartPath = computed(() => this.buildLinePath(this.forecast()));
  readonly bandPath = computed(() => this.buildBandPath(this.forecast()));

  constructor() {
    this.loadTransactions();
    this.loadDailySummary();
    this.loadForecast();
    this.loadInsights();
    this.setupSimulation();
  }

  // Called from template when user changes branch selection
  setBranch(code: string): void {
    this.branch.setBranch(code);
  }

  logout(): void {
    this.auth.logout();
  }

  trackByIndex = (_: number, item: unknown) => item;

  private buildLinePath(points: ReturnType<typeof this.forecast>): string {
    if (!points.length) return '';
    const { min, max } = this.getBounds(points);
    return points
      .map((point, index) => {
        const x = this.normaliseX(index, points.length);
        const y = this.normaliseY(point.projected, min, max);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }

  private buildBandPath(points: ReturnType<typeof this.forecast>): string {
    if (!points.length) return '';
    const { min, max } = this.getBounds(points);
    const top = points.map((point, index) => `L ${this.normaliseX(index, points.length)} ${this.normaliseY(point.high, min, max)}`);
    const bottom = [...points]
      .reverse()
      .map((point, index) => `L ${this.normaliseX(points.length - 1 - index, points.length)} ${this.normaliseY(point.low, min, max)}`);
    const start = `M 0 ${this.normaliseY(points[0].high, min, max)}`;
    return `${start} ${top.slice(1).join(' ')} ${bottom.join(' ')} Z`;
  }

  private getBounds(points: ReturnType<typeof this.forecast>) {
    const lows = points.map(p => p.low);
    const highs = points.map(p => p.high);
    return { min: Math.min(...lows), max: Math.max(...highs) };
  }

  private normaliseX(index: number, length: number): number {
    if (length <= 1) return 0;
    return (index / (length - 1)) * 100;
  }

  private normaliseY(value: number, min: number, max: number): number {
    const height = 100;
    if (max === min) return height;
    const ratio = (value - min) / (max - min);
    return Math.round((1 - ratio) * height);
  }

  private loadTransactions(): void {
    this.accountCode$
      .pipe(
        switchMap(code =>
          this.api
            .getTransactions(code)
            .pipe(catchError(() => of({ items: [] })))
        ),
        takeUntilDestroyed()
      )
      .subscribe(result => {
        const items = (result as { items?: TransactionDto[] }).items ?? [];
        this.transactions.set(items);
      });
  }

  private loadDailySummary(): void {
    this.accountCode$
      .pipe(
        switchMap(code =>
          this.api.getDailySummary(code).pipe(catchError(() => of([])))
        ),
        takeUntilDestroyed()
      )
      .subscribe(summary => this.summary.set(summary));
  }

  private loadForecast(): void {
    const horizonChanges$ = this.simulationForm.controls.horizon.valueChanges.pipe(
      startWith(this.simulationForm.value.horizon ?? 14)
    );

    combineLatest([this.accountCode$, horizonChanges$])
      .pipe(
        switchMap(([code, horizon]) =>
          this.api.getForecast(code, horizon ?? 14).pipe(catchError(() => of(null)))
        ),
        takeUntilDestroyed()
      )
      .subscribe(response => this.forecastResponse.set(response));
  }

  private loadInsights(): void {
    this.accountCode$
      .pipe(
        switchMap(code =>
          this.api.getInsights(code).pipe(catchError(() => of(null)))
        ),
        takeUntilDestroyed()
      )
      .subscribe(result => {
        if (!result) {
          this.insights.set([]);
          this.actions.set([]);
          this.alerts.set([]);
          return;
        }

        this.insights.set(
          result.cards.map(card => ({
            title: card.title,
            detail: card.summary,
            impact: this.mapImpact(card.impact),
            confidence: this.mapConfidence(card.confidence)
          }))
        );

        this.actions.set(
          result.nextBestActions.map(action => ({
            title: action.actionType,
            description: action.description,
            priority: this.mapPriority(action.priority),
            owner: action.suggestedBy
          }))
        );

        this.alerts.set(
          result.warnings.map(warning => ({
            severity: this.mapSeverity(warning.severity),
            message: warning.message,
            date: warning.expectedDate ?? undefined
          }))
        );
      });
  }

  private setupSimulation(): void {
    const sliderChanges$ = this.simulationForm.valueChanges.pipe(
      startWith(this.simulationForm.getRawValue()),
      debounceTime(200)
    );

    combineLatest([this.accountCode$, sliderChanges$])
      .pipe(
        switchMap(([accountCode, slider]) =>
          this.api.runSimulation({
            accountCode,
            inflowAdjustmentPercent: slider?.inflowDelta ?? 0,
            outflowAdjustmentPercent: slider?.outflowDelta ?? 0,
            horizonDays: slider?.horizon ?? 14
          })
        ),
        takeUntilDestroyed()
      )
      .subscribe(results => {
        const first = results.at(0);
        if (!first) {
          this.simulation.set(defaultSimulationState);
          return;
        }

        this.simulation.set({
          headline: first.narrative,
          projection: first.projectedBalance,
          inflow: first.adjustedInflow,
          outflow: first.adjustedOutflow,
          narrative: first.narrative
        });
      });
  }

  private buildMetrics(
    transactions: TransactionDto[],
    forecast: ForecastResponseDto | null,
    summary: DailyCashflowSummaryDto[]
  ): SummaryMetric[] {
    if (!transactions.length && !forecast) {
      return [];
    }

    const latestBalance = transactions.at(0)?.balanceZar ?? 0;
    const projected = forecast?.points.at(-1)?.projectedBalance ?? latestBalance;
    const forecastLift = projected - latestBalance;
    const avgDebit =
      summary.length > 0
        ? summary.reduce((total, item) => total + item.totalDebits, 0) / summary.length
        : 0;
    const netFlow = summary.at(0)?.netFlow ?? 0;
    const runwayDays = avgDebit > 0 ? Math.round((forecast?.startingBalance ?? latestBalance) / avgDebit) : 0;

    return [
      {
        label: 'Current balance',
        value: this.formatCurrency(latestBalance),
        change: `${forecastLift >= 0 ? '+' : '-'}${this.formatCurrency(Math.abs(forecastLift))} vs forecast`,
        trend: forecastLift >= 0 ? 'up' : 'down'
      },
      {
        label: 'Projected (14d)',
        value: this.formatCurrency(projected),
        change: `Model: ${forecast?.modelDescription ?? 'Heuristic'}`,
        trend: projected >= latestBalance ? 'up' : 'down'
      },
      {
        label: 'Burn rate',
        value: this.formatCurrency(avgDebit),
        change: 'Avg daily outflows',
        trend: avgDebit <= netFlow ? 'up' : 'down'
      },
      {
        label: 'Runway',
        value: `${runwayDays} days`,
        change: netFlow >= 0 ? 'Positive net flow' : 'Monitor dips',
        trend: netFlow >= 0 ? 'up' : 'down'
      }
    ];
  }

  private buildDrivers(transactions: TransactionDto[]): DriverBreakdown[] {
    if (!transactions.length) {
      return [
        { label: 'POS Settlements', weight: 40 },
        { label: 'Ecommerce payouts', weight: 30 },
        { label: 'Seasonality uplift', weight: 20 },
        { label: 'FX effects', weight: 10 }
      ];
    }

    const totals = new Map<string, number>();
    transactions.forEach(txn => {
      const key = txn.category || 'Uncategorized';
      const contribution = Math.abs((txn.creditZar ?? 0) - (txn.debitZar ?? 0));
      totals.set(key, (totals.get(key) ?? 0) + contribution);
    });

    const totalValue = Array.from(totals.values()).reduce((acc, value) => acc + value, 0) || 1;

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({
        label,
        weight: Math.round((value / totalValue) * 100)
      }));
  }

  private formatCurrency(value: number): string {
    const formatter = new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      maximumFractionDigits: 0
    });
    return formatter.format(value || 0);
  }

  private mapImpact(value: string): InsightCard['impact'] {
    const normalized = value?.toLowerCase() ?? '';
    if (normalized.includes('risk')) return 'Risk';
    if (normalized.includes('neutral')) return 'Neutral';
    return 'Positive';
  }

  private mapConfidence(value: string): InsightCard['confidence'] {
    const normalized = value?.toLowerCase() ?? '';
    if (normalized.includes('low')) return 'Low';
    if (normalized.includes('medium')) return 'Medium';
    return 'High';
  }

  private mapPriority(value: string): NextBestAction['priority'] {
    const normalized = value?.toLowerCase() ?? '';
    if (normalized.includes('high')) return 'High';
    if (normalized.includes('medium')) return 'Medium';
    return 'Low';
  }

  private mapSeverity(value: string): Warning['severity'] {
    const normalized = value?.toLowerCase() ?? '';
    if (normalized.includes('high') || normalized.includes('critical')) return 'critical';
    if (normalized.includes('medium') || normalized.includes('warn')) return 'warning';
    return 'info';
  }
}

type SimulationState = {
  headline: string;
  projection: number;
  inflow: number;
  outflow: number;
  narrative: string;
};

const defaultSimulationState: SimulationState = {
  headline: 'Adjust inflows/outflows to stress test your balance',
  projection: 0,
  inflow: 0,
  outflow: 0,
  narrative: ''
};
