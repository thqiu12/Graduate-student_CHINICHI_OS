// src/utils/auth-cookies.ts
// JWT 通过 HttpOnly Cookie 下发,杜绝 XSS 拖走长效 token。
// 配合一个非 HttpOnly 的 csrf_token cookie 实现 double-submit CSRF 防护。

import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

export const ACCESS_COOKIE = 'chinichi_at';
export const REFRESH_COOKIE = 'chinichi_rt';
export const CSRF_COOKIE = 'chinichi_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const isProduction = process.env['NODE_ENV'] === 'production';

function parseDurationSeconds(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) return fallback;
  const n = parseInt(match[1]!, 10);
  switch (match[2]) {
    case 'd': return n * 86400;
    case 'h': return n * 3600;
    case 'm': return n * 60;
    case 's':
    default:  return n;
  }
}

const ACCESS_TTL = parseDurationSeconds(process.env['JWT_ACCESS_EXPIRES_IN'], 2 * 3600);
const REFRESH_TTL = parseDurationSeconds(process.env['JWT_REFRESH_EXPIRES_IN'], 30 * 86400);

function baseOptions() {
  return {
    httpOnly: true,
    secure: isProduction,                // 本地 dev 用 http,生产强制 https
    sameSite: 'lax' as const,            // 跨域 GET 仍能携带(导航/跳转友好);state-changing 走 CSRF 校验
    path: '/',
  };
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
): string {
  const csrfToken = randomUUID();
  const base = baseOptions();

  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_TTL });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: REFRESH_TTL, path: '/api/auth' });
  // CSRF token 故意 HttpOnly=false,让前端 JS 读取后回填到请求头
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: ACCESS_TTL,
  });

  return csrfToken;
}

export function clearAuthCookies(reply: FastifyReply): void {
  const base = baseOptions();
  reply.clearCookie(ACCESS_COOKIE, base);
  reply.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/auth' });
  reply.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}

/**
 * Double-submit Cookie CSRF 校验:
 * 非幂等请求(POST/PUT/PATCH/DELETE)必须在 X-CSRF-Token 头里回传 csrf cookie 的值;
 * 浏览器同源策略保证跨站攻击者无法读到 cookie,因此无法伪造 header。
 *
 * 例外:
 *   - 未带任何 cookie 的请求(认为不是 cookie 会话,直接放行交给 jwtVerify)
 *   - Authorization Bearer 请求(向后兼容,不走 cookie 流程)
 */
export function verifyCsrf(request: FastifyRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  // 没有 access cookie → 不是 cookie 会话,跳过(可能是用 Bearer 调用)
  const hasCookieSession = Boolean(request.cookies?.[ACCESS_COOKIE]);
  if (!hasCookieSession) return true;

  const headerToken = request.headers[CSRF_HEADER];
  const cookieToken = request.cookies?.[CSRF_COOKIE];
  if (!headerToken || !cookieToken) return false;
  return String(headerToken) === cookieToken;
}
