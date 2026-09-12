/*
 * SMTP Verification Email Module
 *
 * Builds and sends the SMTP verification mail used for account activation.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>SMTP email activation: verification mail generation and delivery.</p>
 *
 * <ul>
 * <li>nodemailer is loaded dynamically via createRequire: after running
 * `npm install nodemailer` in the plugin directory or the site root the
 * plugin works out of the box; when it is missing or unconfigured a clear
 * error message is returned, so the module carries no hard dependency and
 * keeps its standalone, base-independent nature.</li>
 * <li>Templates use placeholder substitution ({{siteName}} / {{username}} /
 * {{verifyUrl}} / {{siteUrl}}) and support the default template as well as
 * uploaded custom HTML templates.</li>
 * </ul>
 *
 * @since 1.0.0
 */

import { createRequire } from 'node:module';
import type { EmailVerifyConfig } from './config.js';
import { DEFAULT_TEMPLATE } from './config.js';

const require = createRequire(import.meta.url);

export interface MailVars {
  siteName: string;
  username: string;
  verifyUrl: string;
  siteUrl: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));
}

/** 渲染模板：先做 HTML 转义再替换占位符。 */
export function renderTemplate(template: string, vars: MailVars): string {
  const escaped: Record<string, string> = {
    siteName: escapeHtml(vars.siteName),
    username: escapeHtml(vars.username),
    verifyUrl: escapeHtml(vars.verifyUrl),
    siteUrl: escapeHtml(vars.siteUrl)
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key: string) => (key in escaped ? escaped[key] : full));
}

export function resolveTemplate(config: EmailVerifyConfig): string {
  if (config.template === 'custom' && config.templateContent?.trim()) return config.templateContent;
  return DEFAULT_TEMPLATE;
}

/** 邮箱域名是否在白名单内（忽略大小写与空白）。 */
export function isWhitelisted(email: string, domains: string[]): boolean {
  const domain = String(email ?? '').trim().split('@').pop()?.toLowerCase() ?? '';
  return domains.map((d) => d.trim().toLowerCase()).includes(domain);
}

/** 已知邮箱服务商登录地址；未知服务商返回 null（前端显示通用文案）。 */
export function providerUrl(email: string): string | null {
  const domain = String(email ?? '').trim().split('@').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    'qq.com': 'https://mail.qq.com',
    'foxmail.com': 'https://mail.qq.com',
    'outlook.com': 'https://outlook.live.com',
    'hotmail.com': 'https://outlook.live.com',
    'gmail.com': 'https://mail.google.com',
    '163.com': 'https://mail.163.com',
    '126.com': 'https://mail.126.com',
    '139.com': 'https://mail.10086.cn'
  };
  return map[domain] ?? null;
}

export interface MailerResult { accepted: string[]; rejected: string[]; }

/**
 * 发送验证邮件。配置缺失、nodemailer 未安装、连接/发送失败都会抛出带中文提示的 Error。
 */
export async function sendVerificationMail(config: EmailVerifyConfig, to: string, subject: string, html: string): Promise<MailerResult> {
  const { smtp } = config;
  if (!smtp.host.trim()) throw new Error('SMTP 地址未配置，请在「高级用户管理 → 设置」中完成 SMTP 配置。');
  if (!smtp.user.trim() || !smtp.password) throw new Error('SMTP 账号或密码未配置。');

  let nodemailer: { createTransport: (options: Record<string, unknown>) => { sendMail: (mail: Record<string, unknown>) => Promise<MailerResult>; close?: () => void; verify: () => Promise<boolean> } };
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('未检测到 nodemailer 依赖。请在站点根目录或插件目录执行：npm install nodemailer');
  }

  const secure = smtp.encryption === 'ssl';
  const requireTLS = smtp.encryption === 'starttls';

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 25,
    secure,
    requireTLS,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000
  });

  try {
    const from = smtp.from.trim() || smtp.user;
    const result = await transport.sendMail({
      from,
      to,
      subject,
      html
    });
    return result;
  } finally {
    try { transport.close?.(); } catch { /* 忽略关闭错误 */ }
  }
}

/** 生成激活邮件 HTML（标题含站点名）。 */
export function buildVerificationMail(config: EmailVerifyConfig, vars: MailVars): { subject: string; html: string } {
  const subject = `【${vars.siteName}】现已启用新用户验证，请点击下方链接完成验证。`;
  return { subject, html: renderTemplate(resolveTemplate(config), vars) };
}