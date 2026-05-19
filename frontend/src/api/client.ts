// src/api/client.ts
// 知日塾大学院考学进度管理系统 - Axios HTTP 客户端
// 认证采用 HttpOnly Cookie + double-submit CSRF Token。
// 兼容期同时支持 Authorization Bearer(localStorage 里的 token),便于过渡。

import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// ─── 常量 ─────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const TOKEN_KEY = 'chinichi_access_token';
const REFRESH_TOKEN_KEY = 'chinichi_refresh_token';
const CSRF_COOKIE = 'chinichi_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

// ─── Cookie 读取(只读非 HttpOnly 的 csrf) ───────────────
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
}

// ─── Token 存储辅助函数(过渡期保留) ─────────────────────
// 主要认证已走 HttpOnly Cookie;这里仅用于:
//   1. 老客户端 / SSR 还在 Bearer 模式
//   2. 登录响应里 csrfToken 缓存,刷新页面前用 cookie 兜底
export const tokenStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  removeToken: (): void => localStorage.removeItem(TOKEN_KEY),

  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string): void => localStorage.setItem(REFRESH_TOKEN_KEY, token),
  removeRefreshToken: (): void => localStorage.removeItem(REFRESH_TOKEN_KEY),

  clearAll: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export function getErrorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

// ─── 创建 Axios 实例 ──────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  withCredentials: true, // 让浏览器携带 HttpOnly cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── 请求拦截器：附加 CSRF 头 + 兼容期 Bearer ────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    // 1) CSRF: 非幂等方法回填 cookie 里的 csrf token
    const method = (config.method ?? 'get').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const csrf = readCookie(CSRF_COOKIE);
      if (csrf && config.headers) {
        config.headers[CSRF_HEADER] = csrf;
      }
    }

    // 2) 过渡期 Bearer: 仅在没有 csrf cookie(即没用上新 cookie 会话)时回退
    const token = tokenStorage.getToken();
    if (token && config.headers && !readCookie(CSRF_COOKIE)) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// ─── 是否正在刷新 Token（防止并发刷新） ──────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ─── 响应拦截器：处理 401 自动刷新/登出 ──────────────────
apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;
    const status = error.response?.status;

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/phone-login')
    ) {
      // Cookie 会话下不需要前端拿 refresh token,直接调 /auth/refresh
      // Bearer 会话(老客户端)从 localStorage 读
      const refreshTokenBody = tokenStorage.getRefreshToken()
        ? { refreshToken: tokenStorage.getRefreshToken() }
        : {};

      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (token && originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        const response = await axios.post<{
          data: { accessToken?: string; refreshToken?: string };
        }>(`${BASE_URL}/auth/refresh`, refreshTokenBody, { withCredentials: true });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        // Cookie 会话下两个字段可能不返回(后端已写 cookie),保留兼容
        if (accessToken) tokenStorage.setToken(accessToken);
        if (newRefreshToken) tokenStorage.setRefreshToken(newRefreshToken);

        processQueue(null, accessToken ?? null);

        if (accessToken && originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        handleLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

/**
 * 处理登出：清除 Token，重定向到登录页
 */
function handleLogout(): void {
  tokenStorage.clearAll();
  window.dispatchEvent(new CustomEvent('auth:logout'));
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
}

export default apiClient;
