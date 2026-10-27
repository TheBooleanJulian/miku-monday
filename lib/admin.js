// Owner-only checks. OWNER_TELEGRAM_ID may hold one id or a comma-separated list.

export function adminIds(env) {
  return String(env.OWNER_TELEGRAM_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const isAdmin = (env, userId) => userId != null && adminIds(env).includes(String(userId));

// Wraps a handler so non-admins are silently ignored (same as bot-core's @admin_only(reply=None)).
export const adminOnly = (handler) => (ctx) => (isAdmin(ctx.env, ctx.from?.id) ? handler(ctx) : undefined);
