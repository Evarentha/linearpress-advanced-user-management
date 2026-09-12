# 高级用户管理（advanced-user-management）

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-advanced-user-management.svg)](https://www.npmjs.com/package/@evarentha/linearpress-advanced-user-management) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

`advanced-user-management` 是一个 LinearPress 插件，从四个环节加固账号生命周期：注册、登录、邮箱激活与注销。启用邮箱激活后，未完成验证的用户将无法发表评论。本插件不引用任何基础程序内部实现，仅通过公开的 Cordis 服务工作，安装与卸载均无残留。

## 安装

```bash
git clone https://github.com/Evarentha/linearpress-advanced-user-management.git src/plugins/advanced-user-management
```

目录名必须与插件 id 一致，安装后需重启 LinearPress。也可以在 `base` 检出中执行 `sh scripts/sync-plugins.sh advanced-user-management`，或在后台插件页上传 ZIP、填写 npm 包名。如需使用 SMTP 邮箱激活，请在站点中执行 `npm install nodemailer`（安装于插件目录内亦可），这是该功能唯一的外部依赖。

## 登录限流与封禁

登录失败按两个独立维度计数：用户名与来源 IP。最多可配置三档，每档具有各自的窗口、阈值与封禁时长。默认值：10 分钟内失败 10 次封禁 15 分钟，30 分钟内失败 15 次封禁 60 分钟，一小时内失败 25 次封禁 90 分钟。同一主体一日内第三次触发封禁后进入阶梯升级：3 天、7 天、永久。永久封禁可以禁用，改用可配置的兜底时长（默认 30 天）。后台提供解封队列。

注册表单新增确认密码字段，浏览器端实时校验，服务端再次强制校验；该功能可在设置中禁用。

## 邮箱激活

默认关闭。启用后，新用户初始处于未验证状态，系统寄送含激活链接的邮件，链接有效期可配置（默认 48 小时）。内置发件域名白名单；邮件模板可使用内置 HTML 模板，亦可上传自定义模板，占位符包括 `{{siteName}}`、`{{username}}`、`{{verifyUrl}}`、`{{siteUrl}}`，设置页中的测试邮件按钮可直接验证 SMTP 配置。未验证用户发表评论将被 `comment:beforeCreate` Hook 拦截。

## 账号注销

用户提交注销申请（理由可选），管理员批准后进入冷却期（默认 30 天，可配置，期间用户可撤销），到期后由定时任务执行物理删除。文章随账号删除或转移给超级管理员，取决于设置项。超级管理员自身不可注销。

## 后台与设置

控制台位于 `/admin/advanced-user-management`（侧栏入口「账户安全」），设置页位于 `/admin/advanced-user-management/settings`，另有恢复默认操作。前述各节的全部开关均在此配置。配置以 JSON 形式存储于插件注册表，键为 `advanced-user-management`；`aum:manage` 权限守护控制台、设置及全部治理操作：解封、注销审批、手动标记已验证、重发激活邮件、SMTP 测试。

## 备注

本插件接管 `POST /login`、`POST /register`、`GET /register`，并新增 `GET /verify` 处理激活链接。用户页面为 `/profile` 与 `/profile/settings`，注销申请在设置页提交与撤销。与 easy-2fa 兼容：登录覆盖通过 `next()` 交还控制权，双因素挑战照常执行；oidc-sso 亦可并行运行。colorful-profiles 复用 `aum_users` 表与 SMTP 配置，一份配置供两个插件共用。数据表（业务库）：`aum_users`、`aum_login_failures`、`aum_bans`、`aum_delete_requests`。

## 许可证

本项目以 GPL-3.0-or-later 许可发布，Copyright (C) 2026 Evarentha，完整文本见 [LICENSE](LICENSE)。
