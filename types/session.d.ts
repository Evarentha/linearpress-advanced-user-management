/*
 * Express Session Type Augmentation
 *
 * Declares req.session.userId so the plugin stays type-self-sufficient.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>Standalone-module type self-sufficiency: declares req.session.userId,
 * kept consistent with Base src/types/session.d.ts so the two can coexist
 * without conflicting type merges.</p>
 *
 * @since 1.0.0
 */

import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}