/*
 * Account Deletion Workflow
 *
 * Business layer for account deletion requests: approval, cooldown, and the
 * final physical deletion.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>Account deletion business layer: the user submits a request, the admin
 * group approves it, a configurable cooldown period runs (30 days by
 * default), and the system then performs the physical deletion.</p>
 *
 * <p>Physical deletion handles posts, comments, and the user record in
 * dependency order inside store.physicalDeleteUser.</p>
 *
 * @since 1.0.0
 */

import type { Db, DeleteRequestView } from './store.js';
import { approveDeleteRequest, cancelDeleteRequest, createDeleteRequest, dueDeletionRequests, getDeleteRequest, listDeleteRequests, physicalDeleteUser, rejectDeleteRequest } from './store.js';
import type { DeletionConfig } from './config.js';

export interface DeleteUserInfo { id: number; username: string; is_super_admin: number; }

/** 用户提交注销申请。超管不可注销；已有进行中申请时返回 false。 */
export async function requestDeletion(db: Db, user: DeleteUserInfo, reason: string): Promise<{ ok: boolean; message: string }> {
  if (Number(user.is_super_admin)) return { ok: false, message: '超级管理员账号不允许注销。' };
  const existing = await getDeleteRequest(db, user.id);
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return { ok: false, message: '你已提交过注销申请，请等待管理员审批或先撤销。' };
  }
  await createDeleteRequest(db, user.id, reason.trim() || null);
  return { ok: true, message: '注销申请已提交，请等待管理员审批。' };
}

export async function revokeDeletion(db: Db, userId: number): Promise<void> {
  await cancelDeleteRequest(db, userId);
}

export function listDeletionRequests(db: Db): Promise<DeleteRequestView[]> {
  return listDeleteRequests(db);
}

/**
 * 批准注销：设置冷却截止时间（批准时刻 + cooldownDays）。
 * 返回是否成功（仅 pending 状态可批准）。
 */
export async function approveDeletion(db: Db, userId: number, approverId: number, cooldownDays: number): Promise<boolean> {
  const now = Date.now();
  const changed = await approveDeleteRequest(db, userId, approverId, now + Math.max(1, cooldownDays) * 24 * 60 * 60 * 1000, now);
  return changed > 0;
}

export async function rejectDeletion(db: Db, userId: number, approverId: number): Promise<boolean> {
  const changed = await rejectDeleteRequest(db, userId, approverId, Date.now());
  return changed > 0;
}

/**
 * 冷却扫描：找出冷却已届满的 approved 申请并执行物理注销。
 * 返回本次实际注销的用户 id 列表。
 */
export async function runSweep(db: Db, config: DeletionConfig): Promise<number[]> {
  const now = Date.now();
  const due = await dueDeletionRequests(db, now);
  const deleted: number[] = [];
  for (const request of due) {
    try {
      await physicalDeleteUser(db, Number(request.user_id), config.deletePosts);
      deleted.push(Number(request.user_id));
    } catch (error) {
      // 单个用户失败不影响其余队列；错误由定时任务日志捕获。
      console.error(`[advanced-user-management] 物理注销用户 ${request.user_id} 失败:`, error);
    }
  }
  return deleted;
}