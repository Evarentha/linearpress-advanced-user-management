# Advanced User Management

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-advanced-user-management.svg)](https://www.npmjs.com/package/@evarentha/linearpress-advanced-user-management) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

`advanced-user-management` is a plugin for LinearPress that hardens the account lifecycle on four fronts: registration, login, email activation, and deletion. With email activation switched on, unverified users cannot comment. The plugin imports no base internals and works only through public Cordis services, so it installs and removes cleanly.

## Install

```bash
git clone https://github.com/Evarentha/linearpress-advanced-user-management.git src/plugins/advanced-user-management
```

The directory name must equal the plugin id. Restart afterwards, or sync from the `base` checkout (`sh scripts/sync-plugins.sh advanced-user-management`), or upload the ZIP / npm name from the admin Plugins page. For SMTP email activation, run `npm install nodemailer` in the site (or inside the plugin directory) afterwards; it is that feature's only external dependency.

## Login limiting and bans

Failed logins are tracked in two independent scopes, username and source IP. Up to three tiers are configurable, each with its own window, threshold, and ban length. The defaults: 10 failures within 10 minutes brings a 15-minute ban, 15 within 30 minutes brings 60 minutes, 25 within an hour brings 90 minutes. When the same subject trips a tier three times in one day, bans escalate along a ladder: 3 days, then 7 days, then permanent. Permanent bans can be switched off, in which case a configurable fallback (30 days by default) applies instead. The admin console ships an unban queue for review.

Registration gets a password confirmation field, checked live in the browser and enforced again on the server, switchable in settings.

## Email activation

Off by default. When enabled, new users start unverified and receive an activation link by mail with a configurable TTL (48 hours by default). A sender domain whitelist is built in. Use the built-in HTML mail template or upload your own with `{{siteName}}`, `{{username}}`, `{{verifyUrl}}`, and `{{siteUrl}}` placeholders, and check the setup with the test-mail button in settings. Unverified users are blocked from commenting through the `comment:beforeCreate` hook.

## Account deletion

The user submits a deletion request with an optional reason, an admin approves it, a cooldown runs (30 days by default, configurable, and the user can cancel during it), then a scheduled job physically deletes the account. Posts go with it or are reassigned to the super admin, depending on the setting. The super admin cannot be deleted.

## Admin and settings

The console lives at `/admin/advanced-user-management` (sidebar entry "账户安全"), settings at `/admin/advanced-user-management/settings`, plus a reset-to-defaults action. Every knob from the sections above is there. The configuration is stored as JSON in the plugin registry under `advanced-user-management`, and `aum:manage` guards the console, settings, and every moderation action: unban, deletion review, manual verify, resend activation mail, and the SMTP test.

## Notes

The plugin takes over `POST /login`, `POST /register`, and `GET /register`, and adds `GET /verify` for the activation link. User pages are `/profile` and `/profile/settings`; deletion requests are submitted and cancelled from the settings page. easy-2fa coexists: the login override passes control on with `next()`, so 2FA challenges still run, and oidc-sso runs alongside. colorful-profiles reuses the `aum_users` table and the SMTP settings, so one configuration serves both. Tables (business database): `aum_users`, `aum_login_failures`, `aum_bans`, `aum_delete_requests`.

## License

GPL-3.0-or-later, Copyright (C) 2026 Evarentha. See LICENSE.
