export interface Competitor {
  name: string;
  website: string;
}

export interface CompanyReport {
  companyName: string;
  website: string;
  phone: string;
  address: string;
  summary: string;
  products: string[];
  painPoints: string[];
  competitors: Competitor[];
}

export interface ResearchEntry {
  id: string;
  query: string;
  status: 'idle' | 'researching' | 'done' | 'error';
  stepIndex: number;
  data: CompanyReport | null;
  error: string | null;
  discordStatus: 'idle' | 'not_connected' | 'sending' | 'sent' | 'error';
}

export interface AppConfig {
  openrouterKey: string;
  serperKey: string;
  model: string;
  botToken: string;
  channelId: string;
  applicantName: string;
  applicantEmail: string;
  apiSaved: boolean;
  discordSaved: boolean;
}

export interface ProgressEvent {
  type: 'progress' | 'result' | 'error';
  step?: number;
  message?: string;
  data?: CompanyReport;
}
