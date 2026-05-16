// src/api/client.ts
// 知日塾大学院考学进度管理系统 - Axios HTTP 客户端
// 配置 JWT 拦截器，401 自动登出

import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// ─── 常量 ─────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const TOKEN_KEY = 'chinichi_access_token';
const REFRESH_TOKEN_KEY = 'chinichi_refresh_token';

// ─── Token 存储辅助函数 ───────────────────────────────────
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

// ─── 创建 Axios 实例 ──────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── 请求拦截器：自动附加 JWT ─────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = tokenStorage.getToken();
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// ─── 是否正在刷新 Token（防止并发刷新） ──────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
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

    // 401 且不是刷新 Token 接口本身（防止无限循环）
    if (
      status === 401 &&
      originalRequest &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/phone-login')
    ) {
      const refreshToken = tokenStorage.getRefreshToken();

      if (!refreshToken) {
        // 没有 refresh token，直接登出
        handleLogout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // 已在刷新中，将请求加入队列
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        const response = await axios.post<{
          data: { accessToken: string; refreshToken: string };
        }>(`${BASE_URL}/auth/refresh`, { refreshToken });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        tokenStorage.setToken(accessToken);
        tokenStorage.setRefreshToken(newRefreshToken);

        processQueue(null, accessToken);

        if (originalRequest.headers) {
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
  // 清除 Zustand store（通过自定义事件）
  window.dispatchEvent(new CustomEvent('auth:logout'));
  // 重定向到登录页
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
}

export default apiClient;
