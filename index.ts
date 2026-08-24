/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/**
 * 高级用户管理插件入口（Cordis 原生插件，export default 即 activate 阶段）。
 *
 * 功能：
 *  1. 注册增强：密码二次确认（前端实时校验 + 后端强校验）。
 *  2. 登录限流：10/30/60 分钟窗口阈值 → 15/60/90 分钟封禁；单日 ≥3 次触发阶梯封禁（3 天/7 天/永久）；
 *     管理端提供解封队列。
 *  3. SMTP 邮件激活：域名白名单、激活链接、注册成功提示；未验证用户权限受限（评论拦截）。
 *  5. 账号注销：用户申请 → 管理组审批 → 冷却期（默认 30 天）→ 系统自动物理注销。
 *
 * 不依赖 Base 内部模块：仅通过 Cordis Context 公开服务（auth/users/posts/comments/
 * permissions/config/plugins/linearpress）工作，可独立部署。
 */

import { randomUUID } from 'node:crypto';
import { Context } from 'cordis';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Db } from './src/store.js';
import { ensureSchema, ensureVerifyRow, findUserIdByToken, getDeleteRequest, getVerifyRow, isVerified, listUsersWithVerify, markVerified, setVerifyToken } from './src/store.js';
import { approveDeletion, listDeletionRequests, rejectDeletion, requestDeletion, revokeDeletion, runSweep } from './src/deletion.js';
import { applyBan, banMessage, checkBan, clearFailures, computeBanDuration, evaluateRule, formatRemaining, listActiveBans, recordFailure, releaseAllBans, releaseBan, scopesFor } from './src/rate-limit.js';
import { buildVerificationMail, isWhitelisted, providerUrl, sendVerificationMail } from './src/email.js';
import type { AumConfig } from './src/config.js';
import { DEFAULT_TEMPLATE, loadConfig, normalizeConfig, parseSettingsForm, saveConfig } from './src/config.js';
import { physicalDeleteUser, sweepExpired } from './src/store.js';

const PLUGIN_ID = 'advanced-user-management';
const ADMIN_ROOT = '/admin/advanced-user-management';
const SETTINGS_URL = `${ADMIN_ROOT}/settings`;
const AUM_PERMISSION = 'aum:manage';
const DAY_MS = 24 * 60 * 60 * 1000;

function param(value: unknown): string { return Array.isArray(value) ? value[0] ?? '' : String(value ?? ''); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : '操作失败'; }
function asId(value: unknown): number { return Number(value) || 0; }
const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
  void Promise.resolve(fn(req, res)).catch((error) => {
    console.error('[advanced-user-management] handler error:', error);
    if (!res.headersSent) res.status(500).render('error', { title: '服务器错误', message: messageOf(error) });
    else next(error);
  });
};

export default async function advancedUserManagement(context: Context) {
  const { web, admin } = context.linearpress;
  const hooks = context.hooks;
  const db = context.databaseService as unknown as Db;
  const auth = context.auth;
  const users = context.users;
  const plugins = context.plugins;

  await ensureSchema(db);
  let config: AumConfig = loadConfig(plugins);
  await context.permissions.register(AUM_PERMISSION, '管理账户安全（封禁队列/注销审批/邮箱验证）');

  const site = async () => {
    const value = await context.config.get();
    return (value?.siteName ?? value?.siteTitle ?? 'LinearPress') as string;
  };

  // ------------------------------------------------------------ 中间件
  const requireLogin: RequestHandler = (req, res, next) => {
    if (!req.session?.userId) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || '/')}`);
    next();
  };
  const requireAum: RequestHandler = async (req, res, next) => {
    if (!req.session?.userId) return res.redirect('/login');
    const allowed = await Promise.resolve(context.permissions.has(req.session.userId, AUM_PERMISSION)).catch(() => false);
    if (!allowed) return res.status(403).render('error', { title: '权限不足', message: '你没有管理账户安全的权限。' });
    next();
  };

  // ------------------------------------------------------------ 登录限流
  /** 查询距离触发下一步封禁还剩余的尝试次数（跨所有 scope/规则取最小）。 */
  async function remainingAttempts(scopes: string[], now: number): Promise<number> {
    if (!config.rateLimit.enable || !config.rateLimit.rules.length) return Infinity;
    const maxWindow = Math.max(...config.rateLimit.rules.map((r) => r.windowMinutes)) * 60 * 1000;
    let left = Infinity;
    for (const scope of scopes) {
      const rows = await db.all<{ failed_at: number }>('SELECT failed_at FROM aum_login_failures WHERE scope=? AND failed_at>?', scope, now - maxWindow);
      const times = rows.map((r) => Number(r.failed_at));
      for (const rule of config.rateLimit.rules) {
        const windowStart = now - rule.windowMinutes * 60 * 1000;
        const count = times.filter((t) => t > windowStart).length;
        left = Math.min(left, Math.max(0, rule.threshold - count));
      }
    }
    return left;
  }

  async function banOnViolation(scopes: string[], now: number): Promise<{ banned: boolean; message: string }> {
    const hit = await evaluateRule(db, scopes, config.rateLimit, now);
    if (!hit) return { banned: false, message: '' };
    for (const scope of scopes) {
      const action = await computeBanDuration(db, scope, config.rateLimit, hit.banMinutes, now);
      await applyBan(db, action, now);
    }
    const check = await checkBan(db, scopes, Date.now());
    return { banned: true, message: banMessage(check) };
  }

  const loginHandler: RequestHandler = wrap(async (req, res) => {
    const username = param(req.body.username);
    const password = param(req.body.password);
    const ip = String(req.ip ?? '');
    const scopes = scopesFor(username, ip);
    const now = Date.now();

    if (config.rateLimit.enable) {
      const check = await checkBan(db, scopes, now);
      if (check.banned) return res.status(429).render('auth/login', { title: '登录', error: banMessage(check) });
    }

    const user = await auth.authenticate(username, password);
    if (!user) {
      if (config.rateLimit.enable) {
        await recordFailure(db, scopes, now);
        const outcome = await banOnViolation(scopes, Date.now());
        if (outcome.banned) return res.status(429).render('auth/login', { title: '登录', error: outcome.message });
        const left = await remainingAttempts(scopes, Date.now());
        const hint = Number.isFinite(left) ? `（距离触发暂时封禁还剩 ${left} 次失败尝试）` : '';
        return res.status(401).render('auth/login', { title: '登录', error: `用户名或密码错误${hint}` });
      }
      return res.status(401).render('auth/login', { title: '登录', error: '用户名或密码错误' });
    }

    if (config.rateLimit.enable) await clearFailures(db, scopes, Date.now());

    if (config.emailVerify.enable) {
      const verified = await isVerified(db, user.id);
      if (!verified) {
        // 凭证正确但邮箱未验证：不写入会话，提示查收激活邮件，避免“已登录但受限”的困惑。
        return res.status(200).render('auth/login', { title: '登录', error: null, notice: '你的邮箱尚未验证，部分功能受限。请在注册邮箱中打开激活链接完成验证。' });
      }
    }

    req.session.userId = user.id;
    res.redirect('/admin');
  });

  // ------------------------------------------------------------ 注册增强
  const registerHandler: RequestHandler = wrap(async (req, res) => {
    const renderError = (error: string) => res.status(400).render('auth/register', { title: '注册', error });
    const username = param(req.body.username);
    const email = param(req.body.email).trim();
    const password = param(req.body.password);
    const confirmation = param(req.body.password_confirmation);

    if (config.requirePasswordConfirmation && password !== confirmation) return renderError('两次输入的密码不一致，请重新确认。');
    if (password.length < 8) return renderError('密码至少需要 8 个字符。');

    const verify = config.emailVerify;
    if (verify.enable) {
      if (!email) return renderError('当前已开启邮件验证，注册必须填写邮箱。');
      if (verify.whitelist.enable && !isWhitelisted(email, verify.whitelist.domains)) {
        return renderError(`仅允许使用以下邮箱后缀注册：${verify.whitelist.domains.join('、')}。`);
      }
    }

    let user: { id: number; username: string; email: string | null };
    try {
      user = await users.register(username, email || null, password);
    } catch (error) {
      return renderError(messageOf(error));
    }
    await ensureVerifyRow(db, user.id);

    if (verify.enable) {
      const token = randomUUID().replace(/-/g, '');
      await setVerifyToken(db, user.id, token, Date.now() + verify.tokenTtlHours * 3600 * 1000);
      const origin = `${req.protocol}://${req.get('host')}`;
      try {
        const mail = buildVerificationMail(verify, {
          siteName: await site(),
          username: user.username,
          verifyUrl: `${origin}/verify?token=${token}`,
          siteUrl: origin
        });
        await sendVerificationMail(verify, user.email ?? '', mail.subject, mail.html);
      } catch (error) {
        // 发送失败则回滚新用户（连带 aum 记录），避免产生无法激活的孤号。
        await physicalDeleteUser(db, user.id, false);
        return renderError(`验证邮件发送失败，请稍后重试或联系管理员：${messageOf(error)}`);
      }
      const provider = providerUrl(user.email ?? '');
      return res.render('aum/register-done', { title: '注册成功', email: user.email, providerUrl: provider, siteName: await site() });
    }

    // 未开启邮件验证：沿用 Base 行为（注册即登录）
    req.session.userId = user.id;
    res.redirect('/');
  });

  // ------------------------------------------------------------ 邮件激活
  const verifyHandler: RequestHandler = wrap(async (req, res) => {
    const token = param(req.query.token);
    if (!token) return res.render('aum/verify', { title: '激活账号', ok: false, message: '缺少激活令牌，激活链接不完整。' });
    const userId = await findUserIdByToken(db, token, Date.now());
    if (!userId) return res.render('aum/verify', { title: '激活账号', ok: false, message: '激活链接无效或已过期，请在个人资料页重新发送验证邮件。' });
    await markVerified(db, userId, Date.now());
    res.render('aum/verify', { title: '激活成功', ok: true, message: '邮箱验证成功，你的账号已获得完整权限，现在可以登录了。' });
  });

  // ------------------------------------------------------------ 用户端：个人资料 / 设置 / 注销
  const profileHandler: RequestHandler = wrap(async (req, res) => {
    const user = await users.findById(req.session.userId!);
    if (!user) return res.status(404).render('error', { title: '用户不存在', message: '当前登录用户不存在。' });
    const verify = config.emailVerify.enable ? await getVerifyRow(db, user.id) : undefined;
    res.render('aum/profile', { title: '个人资料', user, verify: verify ?? { verified: 0, verified_at: null }, emailVerifyEnabled: config.emailVerify.enable });
  });

  const settingsHandler: RequestHandler = wrap(async (req, res) => {
    const user = await users.findById(req.session.userId!);
    if (!user) return res.status(404).render('error', { title: '用户不存在', message: '当前登录用户不存在。' });
    const deletion = await getDeleteRequest(db, user.id);
    const notices: Record<string, string> = {
      requested: '注销申请已提交，请等待管理员审批。',
      cancelled: '已撤销注销申请。',
      denied: '超级管理员账号不允许注销。'
    };
    res.render('aum/settings', {
      title: '账户设置', user, deletion,
      cooldownDays: config.deletion.cooldownDays,
      notice: notices[param(req.query.notice)] ?? (req.query.notice === 'error' ? String(req.query.message ?? '操作失败') : '')
    });
  });

  const deleteAccountHandler: RequestHandler = wrap(async (req, res) => {
    const user = await users.findById(req.session.userId!);
    if (!user) return res.status(404).json({ ok: false, message: '用户不存在' });
    const result = await requestDeletion(db, { id: user.id, username: user.username, is_super_admin: user.is_super_admin }, param(req.body.reason));
    res.redirect(`/profile/settings?notice=${result.ok ? 'requested' : 'error'}&message=${encodeURIComponent(result.message)}`);
  });

  const cancelDeleteHandler: RequestHandler = wrap(async (req, res) => {
    await revokeDeletion(db, req.session.userId!);
    res.redirect('/profile/settings?notice=cancelled');
  });

  // ------------------------------------------------------------ 管理端
  const aumAdminHandler: RequestHandler = wrap(async (req, res) => {
    const now = Date.now();
    const [bans, deletions, userVerifications] = await Promise.all([
      config.rateLimit.enable ? listActiveBans(db, now) : [],
      listDeletionRequests(db),
      config.emailVerify.enable ? listUsersWithVerify(db) : []
    ]);
    res.render('admin/aum', {
      title: '账户安全',
      bans, deletions, userVerifications,
      rateLimitEnabled: config.rateLimit.enable,
      emailVerifyEnabled: config.emailVerify.enable,
      cooldownDays: config.deletion.cooldownDays,
      now,
      notice: param(req.query.notice),
      formatRemaining
    });
  });

  const releaseBanHandler: RequestHandler = wrap(async (req, res) => {
    const id = param(req.body.id);
    if (!id) return res.redirect(`${ADMIN_ROOT}?notice=missing`);
    await releaseBan(db, id);
    res.redirect(`${ADMIN_ROOT}?notice=released`);
  });

  const releaseAllHandler: RequestHandler = wrap(async (_req, res) => {
    await releaseAllBans(db);
    res.redirect(`${ADMIN_ROOT}?notice=released-all`);
  });

  const approveDeleteHandler: RequestHandler = wrap(async (req, res) => {
    const userId = asId(req.body.user_id);
    const ok = userId ? await approveDeletion(db, userId, req.session.userId!, config.deletion.cooldownDays) : false;
    res.redirect(`${ADMIN_ROOT}?notice=${ok ? 'approve-ok' : 'approve-err'}`);
  });

  const rejectDeleteHandler: RequestHandler = wrap(async (req, res) => {
    const userId = asId(req.body.user_id);
    const ok = userId ? await rejectDeletion(db, userId, req.session.userId!) : false;
    res.redirect(`${ADMIN_ROOT}?notice=${ok ? 'reject-ok' : 'reject-err'}`);
  });

  const manualVerifyHandler: RequestHandler = wrap(async (req, res) => {
    const userId = asId(req.params.id);
    if (!userId) return res.redirect(`${ADMIN_ROOT}?notice=missing`);
    await markVerified(db, userId, Date.now());
    res.redirect(`${ADMIN_ROOT}?notice=verified`);
  });

  // ------------------------------------------------------------ 设置页
  const settingsViewHandler: RequestHandler = wrap(async (req, res) => {
    res.render('admin/aum-settings', {
      title: '高级用户管理 · 设置',
      config,
      notice: param(req.query.notice),
      defaultTemplate: DEFAULT_TEMPLATE
    });
  });

  const settingsSaveHandler: RequestHandler = wrap(async (req, res) => {
    try {
      const next = parseSettingsForm(req.body as Record<string, unknown>);
      // “SMTP 密码留空保持不变”：表单未填写时沿用当前已保存密码。
      const enteredPassword = String((req.body as Record<string, unknown>).smtp_password ?? '');
      if (!enteredPassword) next.emailVerify.smtp.password = config.emailVerify.smtp.password;
      saveConfig(plugins, next);
      config = next;
      res.redirect(`${SETTINGS_URL}?notice=saved`);
    } catch (error) {
      res.status(400).render('admin/aum-settings', { title: '高级用户管理 · 设置', config, notice: `保存失败：${messageOf(error)}`, defaultTemplate: DEFAULT_TEMPLATE });
    }
  });

  const settingsResetHandler: RequestHandler = wrap(async (_req, res) => {
    const defaults = normalizeConfig(undefined);
    saveConfig(plugins, defaults);
    config = defaults;
    res.redirect(`${SETTINGS_URL}?notice=reset`);
  });

  // 测试 SMTP 连接
  const smtpTestHandler: RequestHandler = wrap(async (req, res) => {
    const probe = parseSettingsForm({ ...req.body, email_verify_enable: 'on', mail_template: 'default' });
    try {
      const mail = buildVerificationMail(probe.emailVerify, { siteName: 'LinearPress', username: '测试', verifyUrl: `${req.protocol}://${req.get('host')}/verify?token=test`, siteUrl: `${req.protocol}://${req.get('host')}` });
      await sendVerificationMail(probe.emailVerify, probe.emailVerify.smtp.from || probe.emailVerify.smtp.user, mail.subject, mail.html);
      res.json({ ok: true, message: 'SMTP 连接成功，测试邮件已发送。' });
    } catch (error) {
      res.status(400).json({ ok: false, message: messageOf(error) });
    }
  });

  // 重发验证邮件
  const resendVerifyHandler: RequestHandler = wrap(async (req, res) => {
    if (!config.emailVerify.enable) return res.status(400).json({ ok: false, message: '邮件验证未启用。' });
    const userId = asId(req.params.id);
    const user = await users.findById(userId);
    if (!user) return res.status(404).json({ ok: false, message: '用户不存在' });
    const row = await getVerifyRow(db, user.id);
    const token = row?.verify_token && row.token_expires_at && (row.token_expires_at ?? 0) > Date.now()
      ? row.verify_token
      : randomUUID().replace(/-/g, '');
    await setVerifyToken(db, user.id, token, Date.now() + config.emailVerify.tokenTtlHours * 3600 * 1000);
    const origin = `${req.protocol}://${req.get('host')}`;
    try {
      const mail = buildVerificationMail(config.emailVerify, { siteName: await site(), username: user.username, verifyUrl: `${origin}/verify?token=${token}`, siteUrl: origin });
      await sendVerificationMail(config.emailVerify, user.email ?? '', mail.subject, mail.html);
      res.json({ ok: true, message: `验证邮件已发送至 ${user.email}` });
    } catch (error) {
      res.status(400).json({ ok: false, message: messageOf(error) });
    }
  });

  // ------------------------------------------------------------ 路由注册
  // 覆盖认证路由（插件路由在 applyToApp 逆序挂载后优先于核心路由）
  web.register('post', '/login', loginHandler);
  web.register('post', '/register', registerHandler);
  web.register('get', '/verify', verifyHandler);

  // 用户端
  web.register('get', '/profile', requireLogin, profileHandler);
  web.register('get', '/profile/settings', requireLogin, settingsHandler);
  web.register('post', '/profile/delete-account', requireLogin, deleteAccountHandler);
  web.register('post', '/profile/cancel-delete', requireLogin, cancelDeleteHandler);

  // 管理端
  web.register('get', ADMIN_ROOT, requireLogin, requireAum, aumAdminHandler);
  web.register('post', '/admin/aum/ban/release', requireLogin, requireAum, releaseBanHandler);
  web.register('post', '/admin/aum/ban/release-all', requireLogin, requireAum, releaseAllHandler);
  web.register('post', '/admin/aum/deletion/approve', requireLogin, requireAum, approveDeleteHandler);
  web.register('post', '/admin/aum/deletion/reject', requireLogin, requireAum, rejectDeleteHandler);
  web.register('post', '/admin/aum/user/:id/verify', requireLogin, requireAum, manualVerifyHandler);
  web.register('post', '/admin/aum/user/:id/resend', requireLogin, requireAum, resendVerifyHandler);
  web.register('post', '/admin/aum/smtp-test', requireLogin, requireAum, smtpTestHandler);

  // 设置页
  web.register('get', SETTINGS_URL, requireLogin, requireAum, settingsViewHandler);
  web.register('post', SETTINGS_URL, requireLogin, requireAum, settingsSaveHandler);
  web.register('post', `${SETTINGS_URL}/reset`, requireLogin, requireAum, settingsResetHandler);

  // 后台扩展：侧栏菜单 + 插件列表入口
  hooks.on('admin:menu', (menu: Array<{ title: string; link: string }>) => [...menu, { title: '账户安全', link: ADMIN_ROOT }]);
  admin.registerCustomSetting({ label: '高级用户管理设置', link: SETTINGS_URL });

  // 未验证用户受限：评论被拦截（需求 3：激活后获得完整权限，验证前部分权限受限）
  hooks.on('comment:beforeCreate', async (payload: { postId: number; userId?: number }) => {
    if (!config.emailVerify.enable || !payload.userId) return payload;
    const verified = await isVerified(db, payload.userId);
    if (!verified) throw new Error('请先完成邮箱验证后再发表评论。请前往个人资料页查看验证状态。');
    return payload;
  });

  // ------------------------------------------------------------ 定时任务（Effect 自动清理）
  context.effect(() => {
    const timer = setInterval(() => {
      void (async () => {
        try {
          await runSweep(db, config.deletion);
          const now = Date.now();
          const maxWindow = Math.max(60, ...config.rateLimit.rules.map((r) => r.windowMinutes));
          await sweepExpired(db, now, (maxWindow + 24 * 60) * 60 * 1000);
        } catch (error) {
          console.error('[advanced-user-management] 定时任务失败:', error);
        }
      })();
    }, 60_000);
    timer.unref?.();
    return () => clearInterval(timer);
  });

  context.logger.info(`advanced-user-management activated (rateLimit=${config.rateLimit.enable}, emailVerify=${config.emailVerify.enable})`);
}