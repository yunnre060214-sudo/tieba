import type { EmailMessage, RunReport, RunStatus } from './domain';

const statusLabels: Record<RunStatus, string> = {
  success: '签到成功',
  partial_failure: '部分失败',
  fatal_failure: '执行失败',
};

function formatBeijingTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function maskForumName(name: string): string {
  if (name.length <= 1) return '*';
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
}

function summaryLines(report: RunReport): string[] {
  return [
    `状态：${statusLabels[report.status]}`,
    `北京时间：${formatBeijingTime(report.finishedAt)}`,
    `执行耗时：${(report.durationMs / 1000).toFixed(2)} 秒`,
    '',
    `总计：${report.counts.total}`,
    `新签到：${report.counts.signed}`,
    `已签到：${report.counts.alreadySigned}`,
    `失败：${report.counts.failed}`,
  ];
}

export function renderConsoleReport(report: RunReport): string {
  const lines = summaryLines(report);
  if (report.fatalReason) {
    lines.push('', `致命错误：${report.fatalReason}`);
  }

  const failed = report.forums.filter(forum => forum.outcome === 'failed');
  if (failed.length > 0) {
    lines.push('', '失败详情：');
    for (const forum of failed) {
      lines.push(`- ${maskForumName(forum.name)}：${forum.reason ?? '未知原因'}（尝试 ${forum.attempts} 次）`);
    }
  }
  return lines.join('\n');
}

export function renderEmailReport(report: RunReport): EmailMessage {
  const lines = summaryLines(report);
  if (report.fatalReason) {
    lines.push('', `致命错误：${report.fatalReason}`);
  }

  const failed = report.forums.filter(forum => forum.outcome === 'failed');
  if (failed.length > 0) {
    lines.push('', '失败详情：');
    for (const forum of failed) {
      lines.push(`- ${forum.name}：${forum.reason ?? '未知原因'}（尝试 ${forum.attempts} 次）`);
    }
  }

  return {
    subject: `[贴吧签到] ${statusLabels[report.status]} - ${formatBeijingTime(report.finishedAt).slice(0, 10)}`,
    body: lines.join('\n'),
  };
}
