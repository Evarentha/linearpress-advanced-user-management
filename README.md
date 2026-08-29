<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 高级用户管理 · Advanced User Management

Signup enhancement, **login throttling with tiered bans**, **SMTP email verification**, and account-deletion approval with cooldown purge. A Cordis-native plugin that works **only through public Cordis Context services** — no internal base dependencies, deployable standalone.

注册增强、**登录限流与阶梯封禁**、**SMTP 邮件激活**、账号注销审批与冷却删除——Cordis 原生插件，**仅通过公开 Cordis Context 服务工作**，不依赖 Base 内部实现，可独立部署。个人资料扩展由独立的「多彩个人资料」插件提供。

> Independent plugin repository for LinearPress **advanced-user-management**. A plugin is a Cordis plugin function — install on demand, disable/uninstall cleanly.
> 本仓库是 LinearPress 插件 **advanced-user-management** 的独立仓库。

## Why Plugins? / 插件化的优势

- **Zero intrusion** —— only public services（`auth/users/posts/comments/permissions/plugins/config/linearpress`）.
  **零侵入**——只使用公开服务。
- **Service-level cooperation** —— SMTP config is reused by colorful-profiles; one config, two plugins.
  **服务级协作**——SMTP 配置同时被多彩资料复用。
- **Optional dependency** —— `nodemailer` optional；missing it only disables email verification.
  **可选依赖**——不装只影响邮件激活。

## Features / 功能

1. **Signup enhancement / 注册增强**——「confirm password」field；front-end live check + server-side enforcement（toggleable）.
2. **Login throttling & tiered bans / 登录限流与阶梯封禁**——tracked by「username + IP」：10-min window ≥10 fails → 15-min ban；30-min ≥15 → 60-min；1-hour ≥25 → 90-min；≥3 ban events/day → tiered（3d/7d/permanent；permanent can be disabled with a fallback of days）。All thresholds adjustable；admin has an unban queue.
3. **SMTP email verification / SMTP 邮件激活**——new users start「unverified」，link activates full permissions；email domain whitelist（qq.com/outlook.com/…editable）；custom HTML template with `{{siteName}} {{username}} {{verifyUrl}} {{siteUrl}}` placeholders.
4. **Account deletion / 账号注销**——users submit a deletion request（optional reason）；admins approve → cooldown（default 30 days）→ auto physical purge（posts deleted or reassigned to super admin，configurable）；users can cancel during cooldown；super admins can't be deleted.

Admin entries：sidebar「账户安全」；plugin list「高级用户管理设置」.

## Install / 安装

```bash
cp -r Plugins/advanced-user-management <site>/src/plugins/advanced-user-management

# SMTP requires nodemailer（either）：
cd <site> && npm install nodemailer
# or / 或
cd <site>/src/plugins/advanced-user-management && npm install nodemailer
```

## Local Development / 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone https://github.com/Averithen/linearpress-advanced-user-management LinearPress/Plugins/advanced-user-management
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh advanced-user-management
npm run dev
```

## Directory / 目录结构

```text
advanced-user-management/
├── plugin.json                  Manifest（permissions: aum:manage）
├── index.ts                     entry：signup/login takeover, throttling, email, deletion flow
├── src/                         config / email / rate-limit / store / deletion modules
├── views/                       login/register overrides、profile settings、verify、admin pages
├── public/                      front-end script & styles
└── types/                       cordis/session declarations
```

## Contribute & Release / 贡献与发布

- conventional commits；`cd base && npm run typecheck` before commit
- Version：`git tag v1.0.0 && git push --tags`
- License：MIT（LICENSE）