export type RunStatus = 'success' | 'partial_failure' | 'fatal_failure';

export interface Forum {
  name: string;
  isSigned: boolean;
}

export type ForumOutcome = 'signed' | 'already_signed' | 'failed';

export interface ForumResult {
  name: string;
  outcome: ForumOutcome;
  attempts: number;
  reason?: string;
  rank?: number;
  consecutiveDays?: number;
}

export interface RunCounts {
  total: number;
  signed: number;
  alreadySigned: number;
  failed: number;
}

export interface RunReport {
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  forums: ForumResult[];
  counts: RunCounts;
  fatalReason?: string;
}

export interface EmailMessage {
  subject: string;
  body: string;
}
