// vite.config.ts
// 知日塾大学院考学进度管理系统 - Vite 构建配置
// 配置开发服务器代理：/api → localhost:3000

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // 开发环境将 /api 请求代理到后端服务
      '/api': {
        target: process.env['VITE_API_PROXY_TARGET'] ?? 'http://localhost:3000',
        changeOrigin: true,
        // 透传 cookie (HttpOnly access cookie 必须能跨 proxy)
        cookieDomainRewrite: 'localhost',
        rewrite: (path) => path, // 保持 /api 前缀不变
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        // 按包分割 chunk，优化加载性能
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          query: ['@tanstack/react-query', 'axios', 'zustand'],
        },
      },
    },
  },

  // 预览服务配置
  preview: {
    port: 4173,
  },
});
