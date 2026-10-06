/*
 * LinearPress Session
 *
 * Implements the session module for LinearPress.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Regenerate before granting login state; propagate session-store failures. */
export function regenerateSession(session: { regenerate(callback: (error?: unknown) => void): unknown }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
