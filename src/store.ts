/*
 * Advanced User Management Data Store
 *
 * Standard-SQL data access layer shared by SQLite and MySQL deployments.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>Data access layer: uses only standard SQL (compatible with both SQLite
 * and MySQL), invoked through databaseService so it follows the main
 * business database (still correct when the MySQL driver is active).</p>
 *
 * <p>This module does not depend on Base internal implementations.</p>
 *
 * @since 1.0.0
 */

export interface Db {
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> | T[];
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> | T | undefined;
  run(sql: string, ...params: unknown[]): Promise<unknown> | unknown;
  exec(sql: string): Promise<void> | void;
  transaction<T>(callback: () => Promise<T> | T): Promise<T> | T;
}

export interface VerifyRow { user_id: number; verified: number; verify_token: string | null; token_expires_at: number | null; verified_at: number | null; }
export interface DeleteRequestRow { user_id: number; reason: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; requested_at: number; approved_at: number | null; approved_by: number | null; cooldown_until: number | null; }

/** 建表（含索引）。全部为跨方言标准 SQL，主键用 UUID 文本避免方言差异。 */
export async function ensureSchema(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS aum_users (
      user_id INTEGER PRIMARY KEY,
      verified INTEGER NOT NULL DEFAULT 0,
      verify_token TEXT,
      token_expires_at INTEGER,
      verified_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS aum_login_failures (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      failed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aum_fail_scope_time ON aum_login_failures(scope, failed_at);
    CREATE TABLE IF NOT EXISTS aum_bans (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      reason TEXT NOT NULL,
      banned_at INTEGER NOT NULL,
      until INTEGER,
      permanent INTEGER NOT NULL DEFAULT 0,
      day TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aum_bans_scope ON aum_bans(scope, until);
    CREATE TABLE IF NOT EXISTS aum_delete_requests (
      user_id INTEGER PRIMARY KEY,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
      requested_at INTEGER NOT NULL,
      approved_at INTEGER,
      approved_by INTEGER,
      cooldown_until INTEGER
    );
  `);
}

// ------------------------------------------------------------------ 邮件验证

export async function getVerifyRow(db: Db, userId: number): Promise<VerifyRow | undefined> {
  return db.get<VerifyRow>('SELECT * FROM aum_users WHERE user_id=?', userId);
}

/** 首次为注册用户建立验证记录（未验证）。 */
export async function ensureVerifyRow(db: Db, userId: number): Promise<void> {
  const existing = await db.get<VerifyRow>('SELECT user_id FROM aum_users WHERE user_id=?', userId);
  if (!existing) await db.run('INSERT INTO aum_users(user_id,verified) VALUES(?,0)', userId);
}

export async function setVerifyToken(db: Db, userId: number, token: string, expiresAt: number): Promise<void> {
  const existing = await db.get<VerifyRow>('SELECT user_id FROM aum_users WHERE user_id=?', userId);
  if (existing) await db.run('UPDATE aum_users SET verify_token=?, token_expires_at=? WHERE user_id=?', token, expiresAt, userId);
  else await db.run('INSERT INTO aum_users(user_id,verified,verify_token,token_expires_at) VALUES(?,0,?,?)', userId, token, expiresAt);
}

export async function findUserIdByToken(db: Db, token: string, now: number): Promise<number | undefined> {
  const row = await db.get<{ user_id: number }>('SELECT user_id FROM aum_users WHERE verify_token=? AND token_expires_at IS NOT NULL AND token_expires_at>?', token, now);
  return row?.user_id;
}

export async function markVerified(db: Db, userId: number, now: number): Promise<void> {
  await db.run('UPDATE aum_users SET verified=1, verify_token=NULL, token_expires_at=NULL, verified_at=? WHERE user_id=?', now, userId);
}

/** 列出全部用户及其验证状态（JOIN users 表）。 */
export async function listUsersWithVerify(db: Db): Promise<Array<{ user_id: number; username: string; email: string | null; verified: number | null; verified_at: number | null }>> {
  return db.all<{ user_id: number; username: string; email: string | null; verified: number | null; verified_at: number | null }>(
    `SELECT u.id AS user_id, u.username, u.email, v.verified, v.verified_at
     FROM users u LEFT JOIN aum_users v ON v.user_id=u.id ORDER BY u.created_at DESC`
  );
}

export async function isVerified(db: Db, userId: number): Promise<boolean> {
  const row = await db.get<{ verified: number }>('SELECT verified FROM aum_users WHERE user_id=?', userId);
  return Boolean(row?.verified);
}

// ------------------------------------------------------------------ 注销申请

export async function createDeleteRequest(db: Db, userId: number, reason: string | null): Promise<void> {
  await db.run("INSERT INTO aum_delete_requests(user_id,reason,status,requested_at) VALUES(?,?,'pending',?)", userId, reason ?? null, Date.now());
}

export async function cancelDeleteRequest(db: Db, userId: number): Promise<void> {
  await db.run("UPDATE aum_delete_requests SET status='cancelled' WHERE user_id=? AND status IN ('pending','approved')", userId);
}

export async function getDeleteRequest(db: Db, userId: number): Promise<DeleteRequestRow | undefined> {
  return db.get<DeleteRequestRow>('SELECT * FROM aum_delete_requests WHERE user_id=?', userId);
}

export interface DeleteRequestView extends DeleteRequestRow {
  username: string;
  email: string | null;
  approved_by_name: string | null;
  group_name: string;
  /** 冷却剩余毫秒（仅 approved） */
  remaining: number;
}

export async function listDeleteRequests(db: Db): Promise<DeleteRequestView[]> {
  const rows = await db.all<DeleteRequestView>(
    `SELECT r.*, u.username, u.email, g.name AS group_name, a.username AS approved_by_name
     FROM aum_delete_requests r
     JOIN users u ON u.id=r.user_id
     LEFT JOIN groups g ON g.id=u.group_id
     LEFT JOIN users a ON a.id=r.approved_by
     ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.requested_at DESC`
  );
  const now = Date.now();
  return rows.map((row) => ({ ...row, remaining: row.cooldown_until ? Math.max(0, Number(row.cooldown_until) - now) : 0 }));
}

export async function approveDeleteRequest(db: Db, userId: number, approverId: number, cooldownUntil: number, approvedAt: number): Promise<number> {
  const result = await db.run("UPDATE aum_delete_requests SET status='approved', approved_by=?, approved_at=?, cooldown_until=? WHERE user_id=? AND status='pending'", approverId, approvedAt, cooldownUntil, userId) as unknown as { changes?: number } | undefined;
  return Number(result?.changes ?? 0);
}

export async function rejectDeleteRequest(db: Db, userId: number, approverId: number, approvedAt: number): Promise<number> {
  const result = await db.run("UPDATE aum_delete_requests SET status='rejected', approved_by=?, approved_at=? WHERE user_id=? AND status='pending'", approverId, approvedAt, userId) as unknown as { changes?: number } | undefined;
  return Number(result?.changes ?? 0);
}

export async function dueDeletionRequests(db: Db, now: number): Promise<DeleteRequestView[]> {
  return db.all<DeleteRequestView>(
    `SELECT r.*, u.username, u.email, g.name AS group_name, a.username AS approved_by_name
     FROM aum_delete_requests r
     JOIN users u ON u.id=r.user_id
     LEFT JOIN groups g ON g.id=u.group_id
     LEFT JOIN users a ON a.id=r.approved_by
     WHERE r.status='approved' AND r.cooldown_until IS NOT NULL AND r.cooldown_until<=?`,
    now
  );
}

/**
 * 物理注销用户。
 * 文章处理：deletePosts=true 时删除文章；false 时尝试转交给首个超级管理员
 * （posts.author_id NOT NULL 且无级联，不处理会导致 FK 约束失败）。
 * 顺序：处理文章 → 删除评论 → 删除插件关联数据 → 删除用户。
 * 全部在单个事务内完成，失败自动回滚。
 */
export async function physicalDeleteUser(db: Db, userId: number, deletePosts: boolean): Promise<void> {
  if (!userId) return;
  await db.transaction(async () => {
    if (deletePosts) {
      await db.run('DELETE FROM posts WHERE author_id=?', userId);
    } else {
      const admin = await db.get<{ id: number }>('SELECT id FROM users WHERE is_super_admin=1 ORDER BY id LIMIT 1');
      if (admin) await db.run('UPDATE posts SET author_id=? WHERE author_id=?', admin.id, userId);
      else await db.run('DELETE FROM posts WHERE author_id=?', userId);
    }
    await db.run('DELETE FROM comments WHERE user_id=?', userId);
    await db.run('DELETE FROM aum_users WHERE user_id=?', userId);
    await db.run('DELETE FROM aum_delete_requests WHERE user_id=?', userId);
    await db.run('DELETE FROM aum_login_failures WHERE scope=?', `user:${userId}`);
    await db.run('DELETE FROM aum_bans WHERE scope=?', `user:${userId}`);
    await db.run('DELETE FROM users WHERE id=?', userId);
  });
}

/** 清理过期失败记录与已到期封禁（定时维护用）。 */
export async function sweepExpired(db: Db, now: number, failureTtl: number): Promise<void> {
  await db.run('DELETE FROM aum_login_failures WHERE failed_at<=?', now - failureTtl);
  await db.run('DELETE FROM aum_bans WHERE permanent=0 AND until IS NOT NULL AND until<=?', now);
}