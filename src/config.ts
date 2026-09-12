/*
 * Advanced User Management Configuration Model
 *
 * Configuration model for the Advanced User Management plugin, with defaults
 * and shallow merging on top of the plugin registry.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>Configuration model of the Advanced User Management plugin.</p>
 *
 * <p>The whole configuration is stored as JSON in the plugin registry
 * (ctx.plugins.getConfig/setConfig), with default values plus shallow
 * merging so behavior stays predictable when fields are missing. This module
 * does not depend on Base internal implementations; it only relies on the
 * plugins service exposed by the cordis Context.</p>
 *
 * @since 1.0.0
 */

/** 插件注册表配置服务的最小接口（由 ctx.plugins 满足）。 */
export interface PluginConfigService {
  getConfig<T = unknown>(id: string): T | null;
  setConfig(id: string, config: unknown): void;
}

export interface RateLimitRule {
  /** 滑动窗口时长（分钟） */
  windowMinutes: number;
  /** 窗口内允许的最大错误次数，达到该次数即触发封禁 */
  threshold: number;
  /** 触发后封禁时长（分钟） */
  banMinutes: number;
}

export interface RateLimitConfig {
  enable: boolean;
  /** 递增档位：10分钟/10次→15分钟；30分钟/15次→60分钟；1小时/25次→90分钟 */
  rules: RateLimitRule[];
  /** 单日内触发封禁达到该次数后进入阶梯封禁 */
  escalationTriggerPerDay: number;
  /** 阶梯时长（天），0 表示永久 */
  escalationDays: number[];
  /** 是否允许永久封禁；关闭时第 3 阶改用 fallbackDays */
  allowPermanentBan: boolean;
  /** 不允许永久封禁时第 3 阶的封禁天数 */
  fallbackDays: number;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** 加密协议：'none' | 'ssl'（465） | 'starttls'（587/25） */
  encryption: 'none' | 'ssl' | 'starttls';
  user: string;
  password: string;
  /** 发件人（邮箱地址） */
  from: string;
}

export interface EmailVerifyConfig {
  enable: boolean;
  smtp: SmtpConfig;
  /** 验证链接有效期（小时） */
  tokenTtlHours: number;
  whitelist: {
    enable: boolean;
    domains: string[];
  };
  /** 'default' 使用内置模板；'custom' 使用 templateContent */
  template: 'default' | 'custom';
  templateContent: string;
}

export interface DeletionConfig {
  /** 批准后冷却天数，期满自动物理注销 */
  cooldownDays: number;
  /** 物理注销时是否一并删除该用户的文章（评论/媒体随之处理） */
  deletePosts: boolean;
}

export interface AumConfig {
  /** 注册表单密码二次确认（前端实时校验 + 后端强校验） */
  requirePasswordConfirmation: boolean;
  rateLimit: RateLimitConfig;
  emailVerify: EmailVerifyConfig;
  deletion: DeletionConfig;
}

const DEFAULT_TEMPLATE = `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
  <div style="padding:24px 28px;background:#18181b;color:#fff">
    <strong style="font-size:17px">{{siteName}} · 账号激活</strong>
  </div>
  <div style="padding:28px">
    <p style="margin:0 0 16px;color:#18181b;font-size:15px;line-height:1.7">{{siteName}} 现已启用新用户验证，请点击下方链接完成验证。</p>
    <p style="margin:0 0 20px;text-align:center">
      <a href="{{verifyUrl}}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:15px">点击激活账号</a>
    </p>
    <p style="margin:0 0 12px;color:#71717a;font-size:13px;line-height:1.7">若无法点击，请复制以下链接到浏览器打开：<br><a href="{{verifyUrl}}" style="color:#2563eb;word-break:break-all">{{verifyUrl}}</a></p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:16px 0">
    <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.7">如您未请求过 SMTP 验证（或未在此网站注册），请忽略此邮件，您的账户将安全无恙。</p>
    <p style="margin:12px 0 0;color:#a1a1aa;font-size:12px">此邮件由 <a href="{{siteUrl}}" style="color:#a1a1aa">{{siteUrl}}</a> 自动发送，请勿直接回复。</p>
  </div>
</div></body></html>`;

const DEFAULT_CONFIG: AumConfig = {
  requirePasswordConfirmation: true,
  rateLimit: {
    enable: true,
    rules: [
      { windowMinutes: 10, threshold: 10, banMinutes: 15 },
      { windowMinutes: 30, threshold: 15, banMinutes: 60 },
      { windowMinutes: 60, threshold: 25, banMinutes: 90 }
    ],
    escalationTriggerPerDay: 3,
    escalationDays: [3, 7, 0],
    allowPermanentBan: true,
    fallbackDays: 30
  },
  emailVerify: {
    enable: false,
    smtp: {
      host: '',
      port: 25,
      encryption: 'starttls',
      user: '',
      password: '',
      from: ''
    },
    tokenTtlHours: 48,
    whitelist: {
      enable: true,
      domains: ['qq.com', 'outlook.com', 'hotmail.com', 'gmail.com', 'foxmail.com', '163.com', '126.com']
    },
    template: 'default',
    templateContent: ''
  },
  deletion: {
    cooldownDays: 30,
    deletePosts: true
  }
};

export function getDefaultConfig(): AumConfig { return structuredClone(DEFAULT_CONFIG); }

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function asBoolean(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }
function asString(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }

/** 合并用户配置到默认值；未知字段忽略，非法数值回退。 */
export function normalizeConfig(raw: unknown): AumConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaults = getDefaultConfig();

  const rulesRaw = (input.rateLimit && typeof input.rateLimit === 'object' ? (input.rateLimit as Record<string, unknown>).rules : undefined);
  const parsedRules = Array.isArray(rulesRaw) && rulesRaw.length > 0
    ? (rulesRaw as unknown[])
      .filter((rule): rule is Record<string, unknown> => Boolean(rule && typeof rule === 'object'))
      .map((rule) => ({ windowMinutes: Number(rule.windowMinutes) || 0, threshold: Number(rule.threshold) || 0, banMinutes: Number(rule.banMinutes) || 0 }))
      .filter((rule) => rule.windowMinutes > 0 && rule.threshold > 0 && rule.banMinutes > 0)
      .map((rule) => ({ windowMinutes: rule.windowMinutes, threshold: Math.max(1, rule.threshold), banMinutes: Math.max(1, rule.banMinutes) }))
    : defaults.rateLimit.rules;
  const rules = parsedRules.length > 0 ? parsedRules : defaults.rateLimit.rules;
  const sortedRules = [...rules].sort((a, b) => a.windowMinutes - b.windowMinutes);

  const rawRate = (input.rateLimit && typeof input.rateLimit === 'object' ? input.rateLimit : {}) as Record<string, unknown>;
  const rawEscalation = Array.isArray(rawRate.escalationDays)
    ? rawRate.escalationDays.map(Number).filter((n) => Number.isFinite(n) && n >= 0)
    : defaults.rateLimit.escalationDays;
  const escalationDays = rawEscalation.length >= 1 ? rawEscalation : defaults.rateLimit.escalationDays;

  const rawSmtp = (input.emailVerify && typeof input.emailVerify === 'object' ? (input.emailVerify as Record<string, unknown>).smtp : {}) as Record<string, unknown>;
  const rawVerify = (input.emailVerify && typeof input.emailVerify === 'object' ? input.emailVerify : {}) as Record<string, unknown>;
  const rawWhitelist = (rawVerify.whitelist && typeof rawVerify.whitelist === 'object' ? rawVerify.whitelist : {}) as Record<string, unknown>;
  const rawDeletion = (input.deletion && typeof input.deletion === 'object' ? input.deletion : {}) as Record<string, unknown>;

  return {
    requirePasswordConfirmation: asBoolean(input.requirePasswordConfirmation, defaults.requirePasswordConfirmation),
    rateLimit: {
      enable: asBoolean(rawRate.enable, defaults.rateLimit.enable),
      rules: sortedRules,
      escalationTriggerPerDay: asNumber(rawRate.escalationTriggerPerDay, defaults.rateLimit.escalationTriggerPerDay),
      escalationDays,
      allowPermanentBan: asBoolean(rawRate.allowPermanentBan, defaults.rateLimit.allowPermanentBan),
      fallbackDays: asNumber(rawRate.fallbackDays, defaults.rateLimit.fallbackDays)
    },
    emailVerify: {
      enable: asBoolean(rawVerify.enable, defaults.emailVerify.enable),
      smtp: {
        host: asString(rawSmtp.host, defaults.emailVerify.smtp.host),
        port: asNumber(rawSmtp.port, defaults.emailVerify.smtp.port),
        encryption: rawSmtp.encryption === 'ssl' || rawSmtp.encryption === 'starttls' || rawSmtp.encryption === 'none' ? rawSmtp.encryption : defaults.emailVerify.smtp.encryption,
        user: asString(rawSmtp.user, defaults.emailVerify.smtp.user),
        password: asString(rawSmtp.password, defaults.emailVerify.smtp.password),
        from: asString(rawSmtp.from, defaults.emailVerify.smtp.from)
      },
      tokenTtlHours: asNumber(rawVerify.tokenTtlHours, defaults.emailVerify.tokenTtlHours),
      whitelist: {
        enable: asBoolean(rawWhitelist.enable, defaults.emailVerify.whitelist.enable),
        domains: Array.isArray(rawWhitelist.domains)
          ? (rawWhitelist.domains as unknown[]).map((d) => String(d).trim().toLowerCase()).filter(Boolean)
          : defaults.emailVerify.whitelist.domains
      },
      template: rawVerify.template === 'custom' ? 'custom' : 'default',
      templateContent: asString(rawVerify.templateContent, defaults.emailVerify.templateContent)
    },
    deletion: {
      cooldownDays: asNumber(rawDeletion.cooldownDays, defaults.deletion.cooldownDays),
      deletePosts: asBoolean(rawDeletion.deletePosts, defaults.deletion.deletePosts)
    }
  };
}

export function loadConfig(plugins: PluginConfigService): AumConfig {
  const saved = plugins.getConfig<unknown>('advanced-user-management');
  return normalizeConfig(saved);
}

export function saveConfig(plugins: PluginConfigService, config: AumConfig): void {
  plugins.setConfig('advanced-user-management', config);
}

/** 从设置页表单构建配置（checkbox 为 on/undefined，数字为空回退默认）。 */
export function parseSettingsForm(body: Record<string, unknown>): AumConfig {
  const checkbox = (value: unknown): boolean => value === 'on' || value === '1' || value === true;
  const number = (value: unknown, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const text = (value: unknown): string => String(value ?? '').trim();

  const rulesRaw = [1, 2, 3].map((i) => ({
    windowMinutes: number(body[`rules_${i}_window`], 0),
    threshold: number(body[`rules_${i}_threshold`], 0),
    banMinutes: number(body[`rules_${i}_ban`], 0)
  }));
  const rules = rulesRaw.filter((rule) => rule.windowMinutes > 0 && rule.threshold > 0 && rule.banMinutes > 0);
  if (!rules.length) rules.push({ windowMinutes: 10, threshold: 10, banMinutes: 15 });

  const escalationDays = text(body.escalation_days)
    .split(/[,，\s]+/)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const domains = text(body.whitelist_domains)
    .split(/[,，\s]+/)
    .map((d) => d.toLowerCase())
    .filter(Boolean);

  return normalizeConfig({
    requirePasswordConfirmation: checkbox(body.require_password_confirmation),
    rateLimit: {
      enable: checkbox(body.rate_limit_enable),
      rules,
      escalationTriggerPerDay: number(body.escalation_trigger_per_day, 3),
      escalationDays,
      allowPermanentBan: checkbox(body.allow_permanent_ban),
      fallbackDays: number(body.fallback_days, 30)
    },
    emailVerify: {
      enable: checkbox(body.email_verify_enable),
      smtp: {
        host: text(body.smtp_host),
        port: number(body.smtp_port, 25),
        encryption: body.smtp_encryption === 'ssl' || body.smtp_encryption === 'none' || body.smtp_encryption === 'starttls' ? body.smtp_encryption : 'starttls',
        user: text(body.smtp_user),
        password: text(body.smtp_password),
        from: text(body.smtp_from)
      },
      tokenTtlHours: number(body.token_ttl_hours, 48),
      whitelist: {
        enable: checkbox(body.whitelist_enable),
        domains
      },
      template: body.mail_template === 'custom' ? 'custom' : 'default',
      templateContent: text(body.template_content)
    },
    deletion: {
      cooldownDays: number(body.deletion_cooldown_days, 30) || 1,
      deletePosts: checkbox(body.deletion_delete_posts)
    }
  });
}

export { DEFAULT_TEMPLATE };