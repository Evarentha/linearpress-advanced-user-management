/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/**
 * 登录限流与阶梯封禁。
 *
 * 规则（均可在插件配置中调整）：
 *  - 10 分钟窗口内失败 ≥10 次 → 封禁 15 分钟
 *  - 30 分钟窗口内失败 ≥15 次 → 封禁 60 分钟
 *  - 1 小时窗口内失败 ≥25 次 → 封禁 90 分钟
 *  - 单日内同一主体触发封禁 ≥ escalationTriggerPerDay（默认 3）次 →
 *    阶梯封禁 3 天 / 7 天 / 永久（第 3 阶可配置为不允许永久）。
 *
 * 限流主体（scope）同时跟踪「用户名」与「来源 IP」，任一命中封禁即拒绝登录。
 */

import { randomUUID } from 'node:crypto';
import type { Db } from './store.js';
import type { RateLimitConfig } from './config.js';

export interface ActiveBan { id: string; scope: string; reason: string; banned_at: number; until: number | null; permanent: number; day: string; }
export interface BanAction { scope: string; reason: string; until: number | null; permanent: boolean; day: string; }
export interface BanCheck { banned: boolean; ban?: ActiveBan; remaining: number; }

const MS = 60_000;

export function localDate(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function scopesFor(username: string, ip: string): string[] {
  const scopes: string[] = [];
  if (username.trim()) scopes.push(`user:${username.trim()}`);
  if (ip.trim()) scopes.push(`ip:${ip}`); else scopes.push('ip:unknown');
  return scopes;
}

/** 返回任一 scope 的激活中封禁（取到期最晚的）。 */
export async function checkBan(db: Db, scopes: string[], now: number): Promise<BanCheck> {
  if (!scopes.length) return { banned: false, remaining: 0 };
  const marks = scopes.map(() => '?').join(',');
  const rows = await db.all<ActiveBan>(`SELECT * FROM aum_bans WHERE scope IN (${marks}) AND (until IS NULL OR until>?)`, ...scopes, now);
  let chosen: ActiveBan | undefined;
  for (const row of rows) {
    if (!chosen) { chosen = row; continue; }
    const a = row.permanent ? Infinity : Number(row.until);
    const b = chosen.permanent ? Infinity : Number(chosen.until);
    if (a > b) chosen = row;
  }
  if (!chosen) return { banned: false, remaining: 0 };
  const remaining = chosen.permanent ? Infinity : Math.max(0, Number(chosen.until) - now);
  return { banned: true, ban: chosen, remaining };
}

/** 记录一次失败（同时写入多 scope；id 用 UUID 保证跨库主键一致）。 */
export async function recordFailure(db: Db, scopes: string[], now: number): Promise<void> {
  for (const scope of scopes) await db.run('INSERT INTO aum_login_failures(id,scope,failed_at) VALUES(?,?,?)', randomUUID(), scope, now);
}

export async function clearFailures(db: Db, scopes: string[], now: number): Promise<void> {
  for (const scope of scopes) {
    await db.run('DELETE FROM aum_login_failures WHERE scope=?', scope);
    await db.run('DELETE FROM aum_bans WHERE scope=? AND until IS NOT NULL AND until<=?', scope, now);
  }
}

interface FailRow { failed_at: number; }
interface RuleHit { windowMinutes: number; threshold: number; banMinutes: number; count: number; }

/**
 * 对给定 scopes 评估是否达到任一档位的封禁阈值。
 * 返回满足条件中封禁最久的一档；未达阈值返回 null。
 */
export async function evaluateRule(db: Db, scopes: string[], config: RateLimitConfig, now: number): Promise<RuleHit | null> {
  if (!config.enable || !config.rules.length) return null;
  const maxWindow = Math.max(...config.rules.map((r) => r.windowMinutes)) * MS;
  let chosen: RuleHit | null = null;
  for (const scope of scopes) {
    const rows = await db.all<FailRow>('SELECT failed_at FROM aum_login_failures WHERE scope=? AND failed_at>?', scope, now - maxWindow);
    const times = rows.map((r) => Number(r.failed_at));
    for (const rule of config.rules) {
      const windowStart = now - rule.windowMinutes * MS;
      const count = times.filter((t) => t > windowStart).length;
      // 达到更高档（阈值更高、封禁更久）才升级
      if (count >= rule.threshold && (!chosen || rule.banMinutes > chosen.banMinutes)) {
        chosen = { ...rule, count };
      }
    }
  }
  return chosen;
}

/** 计算本次封禁的实际时长/是否永久（含阶梯升级与 allowPermanentBan 兜底）。
 * baseMinutes 为窗口规则命中的基础封禁分钟数。 */
export async function computeBanDuration(db: Db, scope: string, config: RateLimitConfig, baseMinutes: number, now: number): Promise<BanAction> {
  const day = localDate(now);
  // 当日此前触发封禁次数（不含本次）
  const before = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM aum_bans WHERE scope=? AND day=?', scope, day);
  const total = Number(before?.n ?? 0) + 1;

  let actions: BanAction;
  if (total >= config.escalationTriggerPerDay) {
    const index = Math.min(config.escalationDays.length - 1, Math.max(0, total - config.escalationTriggerPerDay));
    const days = Number(config.escalationDays[index]);
    if (days === 0) {
      if (config.allowPermanentBan) actions = { scope, reason: `单日多次违规触发第 ${index + 1} 阶永久封禁`, until: null, permanent: true, day };
      else actions = { scope, reason: `单日多次违规触发长期封禁（${config.fallbackDays} 天）`, until: now + config.fallbackDays * 24 * 60 * MS, permanent: false, day };
    } else {
      actions = { scope, reason: `单日多次违规触发第 ${index + 1} 阶封禁（${days} 天）`, until: now + days * 24 * 60 * MS, permanent: false, day };
    }
  } else {
    actions = { scope, reason: `登录失败次数超限`, until: now + baseMinutes * MS, permanent: false, day };
  }
  return actions;
}

/** 施加封禁（写入 aum_bans）。 */
export async function applyBan(db: Db, action: BanAction, now: number): Promise<void> {
  await db.run('INSERT INTO aum_bans(id,scope,reason,banned_at,until,permanent,day) VALUES(?,?,?,?,?,?,?)',
    randomUUID(), action.scope, action.reason, now, action.until, action.permanent ? 1 : 0, action.day);
}

/** 管理页：列出当前激活中的封禁。 */
export async function listActiveBans(db: Db, now: number): Promise<Array<ActiveBan & { remaining: number }>> {
  const rows = await db.all<ActiveBan>('SELECT * FROM aum_bans WHERE until IS NULL OR until>? ORDER BY banned_at DESC', now);
  return rows.map((row) => ({ ...row, remaining: row.permanent ? Infinity : Math.max(0, Number(row.until) - now) }));
}

export async function releaseBan(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM aum_bans WHERE id=?', id);
}

export async function releaseAllBans(db: Db): Promise<void> {
  await db.run('DELETE FROM aum_bans');
}

/** 剩余时间人类可读文案，如「14 分钟 / 2 小时 5 分 / 3 天 / 永久」。 */
export function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms)) return '永久封禁';
  const minutes = Math.ceil(ms / MS);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return remainMinutes ? `${hours} 小时 ${remainMinutes} 分钟` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours ? `${days} 天 ${remainHours} 小时` : `${days} 天`;
}

/** 根据已封禁状态生成给用户看的提示。 */
export function banMessage(check: BanCheck): string {
  if (!check.banned || !check.ban) return '';
  if (check.ban.permanent) return '该账号已因多次违规被永久封禁，请联系管理员处理。';
  return `尝试次数过多，账号已暂时封禁，剩余 ${formatRemaining(check.remaining)} 后可重试。`;
}