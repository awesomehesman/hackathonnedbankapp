export interface PagedResult<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
}

export interface TransactionDto {
  transactionId: number;
  txnDate: string;
  accountCode: string;
  description?: string;
  debitFc?: number;
  creditFc?: number;
  balanceFc?: number;
  debitZar?: number;
  creditZar?: number;
  balanceZar?: number;
  category?: string;
  reference?: string;
  currency: string;
  fxToZar?: number;
  latitude?: number;
  longitude?: number;
  counterparty?: string;
}

export interface DailyCashflowSummaryDto {
  date: string;
  accountCode: string;
  totalCredits: number;
  totalDebits: number;
  netFlow: number;
}

export interface ForecastPointApiDto {
  date: string;
  projectedBalance: number;
  confidenceLow: number;
  confidenceHigh: number;
}

export interface ForecastResponseDto {
  accountCode: string;
  forecastStart: string;
  startingBalance: number;
  horizonDays: number;
  points: ForecastPointApiDto[];
  modelDescription: string;
}

export interface InsightCardDto {
  title: string;
  summary: string;
  impact: string;
  confidence: string;
}

export interface NextBestActionDto {
  actionType: string;
  description: string;
  priority: string;
  suggestedBy: string;
}

export interface EarlyWarningDto {
  severity: string;
  message: string;
  expectedDate?: string;
  projectedBalance?: number;
}

export interface InsightsResponse {
  accountCode: string;
  cards: InsightCardDto[];
  nextBestActions: NextBestActionDto[];
  warnings: EarlyWarningDto[];
}

export interface WhatIfSimulationRequest {
  accountCode: string;
  inflowAdjustmentPercent: number;
  outflowAdjustmentPercent: number;
  horizonDays: number;
}

export interface WhatIfSimulationDto {
  adjustedInflow: number;
  adjustedOutflow: number;
  projectedBalance: number;
  narrative: string;
}

export interface AuthResponseDto {
  username: string;
  token: string;
  expiresAtUtc: string;
}
