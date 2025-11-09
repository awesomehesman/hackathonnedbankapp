import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import {
  DailyCashflowSummaryDto,
  ForecastResponseDto,
  InsightsResponse,
  PagedResult,
  TransactionDto,
  WhatIfSimulationDto,
  WhatIfSimulationRequest
} from '../models/api.models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CashflowApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getTransactions(accountCode: string, pageSize = 50): Observable<PagedResult<TransactionDto>> {
    let params = new HttpParams().set('pageSize', pageSize).set('pageNumber', 1);
    if (accountCode) {
      params = params.set('accountCode', accountCode);
    }
    return this.http.get<PagedResult<TransactionDto>>(`${this.baseUrl}/transactions`, { params });
  }

  getDailySummary(accountCode: string): Observable<DailyCashflowSummaryDto[]> {
    const params = accountCode ? new HttpParams().set('accountCode', accountCode) : undefined;
    return this.http.get<DailyCashflowSummaryDto[]>(`${this.baseUrl}/transactions/daily-summary`, { params });
  }

  getForecast(accountCode: string, horizonDays: number): Observable<ForecastResponseDto> {
    const params = new HttpParams()
      .set('accountCode', accountCode ?? 'ALL')
      .set('horizonDays', horizonDays);
    return this.http.get<ForecastResponseDto>(`${this.baseUrl}/forecast`, { params });
  }

  getInsights(accountCode: string): Observable<InsightsResponse> {
    return this.http.get<InsightsResponse>(`${this.baseUrl}/insights/${accountCode}`);
  }

  runSimulation(request: WhatIfSimulationRequest): Observable<WhatIfSimulationDto[]> {
    return this.http.post<WhatIfSimulationDto[]>(`${this.baseUrl}/insights/what-if`, request).pipe(
      catchError(() => of([]))
    );
  }
}
