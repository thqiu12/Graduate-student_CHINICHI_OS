// 认证闭环:登录 → 用 cookie 调受保护接口 → logout 真撤销 → 再调拒掉
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { mockReset } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { createTestApp, extractCookie, type TestApp } from './helpers/app';
import * as redisMock from '../src/utils/redis';

const TEST_PHONE = '13900000099';
const TEST_PASSWORD = 'TestPass123!';

let ctx: TestApp;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(TEST_PASSWORD, 4); // cost=4 for test speed
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(() => {
  mockReset(ctx.prisma);
  ctx.prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaClient) => unknown)(ctx.prisma);
    }
    return arg;
  });
  (redisMock as unknown as { __reset?: () => void }).__reset?.();
});

function mockLoginUser() {
  ctx.prisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    name: '测试管理员',
    phone: TEST_PHONE,
    email: null,
    avatarUrl: null,
    passwordHash,
    isActive: true,
    userRoles: [{ role: { code: 'admin_total' } }],
  } as any);
  ctx.prisma.student.findUnique.mockResolvedValue(null);
}

describe('POST /api/auth/login', () => {
  it('账号密码正确时颁 token,写 access/refresh/csrf 三 cookie,返回 csrfToken', async () => {
    mockLoginUser();

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: TEST_PHONE, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { accessToken: string; csrfToken: string } };
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.csrfToken).toBeTruthy();

    const cookies = res.headers['set-cookie'];
    expect(extractCookie(cookies, 'chinichi_at')).toBeTruthy();
    expect(extractCookie(cookies, 'chinichi_rt')).toBeTruthy();
    expect(extractCookie(cookies, 'chinichi_csrf')).toBe(body.data.csrfToken);
  });

  it('密码错误时返回 401,不下发任何 cookie', async () => {
    mockLoginUser();

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: TEST_PHONE, password: 'WrongPassword' },
    });

    expect(res.statusCode).toBe(401);
    expect(extractCookie(res.headers['set-cookie'], 'chinichi_at')).toBeNull();
  });
});

describe('POST /api/auth/logout', () => {
  it('logout 后,原 access token 被 Redis 黑名单拦截,后续请求拿到 TOKEN_REVOKED', async () => {
    mockLoginUser();

    // 1) 先登录拿到 token + csrf
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: TEST_PHONE, password: TEST_PASSWORD },
    });
    const { accessToken, csrfToken } = (login.json() as { data: any }).data;
    const cookies = login.headers['set-cookie'] as string | string[];
    const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies])
      .map((c) => String(c).split(';')[0])
      .join('; ');

    // 2) 撤销
    const logout = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);

    // 3) 再用原 access token 访问受保护接口,应被拒
    //    用 Authorization Bearer,绕过 cookie 路径,直接验证 access token 的黑名单效果
    ctx.prisma.notification.findMany.mockResolvedValue([]);
    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect([401, 403]).toContain(after.statusCode);
    expect(after.json()).toMatchObject({ code: 'TOKEN_REVOKED' });
  });
});

describe('POST /api/auth/refresh', () => {
  it('刷新成功后,旧 refresh token 立即失效(一次性轮转)', async () => {
    mockLoginUser();

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: TEST_PHONE, password: TEST_PASSWORD },
    });
    const oldRefreshToken = (login.json() as { data: any }).data.refreshToken;
    const oldCsrf = (login.json() as { data: any }).data.csrfToken;

    // 第一次刷新成功
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { 'x-csrf-token': oldCsrf },
      payload: { refreshToken: oldRefreshToken },
    });
    expect(first.statusCode).toBe(200);

    // 第二次用同一旧 refresh token 应被拒绝
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { 'x-csrf-token': oldCsrf },
      payload: { refreshToken: oldRefreshToken },
    });
    expect(second.statusCode).toBe(401);
    expect((second.json() as any).code).toBe('UNAUTHORIZED');
  });
});
