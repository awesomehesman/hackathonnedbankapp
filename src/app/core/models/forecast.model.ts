export interface ForecastPoint {
  date: string;
  projected: number;
  low: number;
  high: number;
}

export interface SummaryMetric {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'flat';
}

export interface InsightCard {
  title: string;
  detail: string;
  impact: 'Positive' | 'Neutral' | 'Risk';
  confidence: 'High' | 'Medium' | 'Low';
}

export interface NextBestAction {
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High';
  owner: string;
}

export interface Warning {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  date?: string;
}

export interface DriverBreakdown {
  label: string;
  weight: number;
}
