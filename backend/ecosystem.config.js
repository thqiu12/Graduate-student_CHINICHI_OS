module.exports = {
  apps: [
    {
      name: 'graduate-tracker-api',
      script: 'npx',
      args: 'ts-node src/index.ts',
      cwd: '/home/work/projects/Graduate-student_CHINICHI_OS/backend',
      env: {
        PORT: '3001',
        NODE_ENV: 'development',
      },
    },
  ],
};
