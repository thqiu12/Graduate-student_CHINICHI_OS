// PM2 进程编排
// 用法:
//   开发: pm2 start ecosystem.config.js --only graduate-tracker-dev
//   生产: pm2 start ecosystem.config.js --only graduate-tracker-api --env production
//   日志: pm2 logs graduate-tracker-api
//   重载: pm2 reload graduate-tracker-api (零停机)

const path = require('path');
const BACKEND_DIR = __dirname;

module.exports = {
  apps: [
    // ─── 生产 ────────────────────────────────────────────
    {
      name: 'graduate-tracker-api',
      script: 'dist/index.js',         // 跑编译后的 JS,不再走 ts-node
      cwd: BACKEND_DIR,
      instances: 'max',                // CPU 核数 × 1,充分利用机器
      exec_mode: 'cluster',            // Fastify 在 cluster 下可负载均衡
      max_memory_restart: '700M',      // OOM 自动重启,避免内存泄漏拖垮整机
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOST: '0.0.0.0',
      },
      out_file: path.join(BACKEND_DIR, 'logs/out.log'),
      error_file: path.join(BACKEND_DIR, 'logs/err.log'),
      merge_logs: true,
      time: true,                      // 日志带时间戳
      // 优雅退出:让 Fastify 处理完在途请求 + 关闭 BullMQ 队列
      kill_timeout: 10_000,
      wait_ready: false,
      listen_timeout: 10_000,
    },

    // ─── 开发 ────────────────────────────────────────────
    {
      name: 'graduate-tracker-dev',
      script: 'npx',
      args: 'ts-node src/index.ts',
      cwd: BACKEND_DIR,
      instances: 1,
      watch: ['src'],
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      env: {
        NODE_ENV: 'development',
        PORT: '3000',
      },
    },
  ],
};
