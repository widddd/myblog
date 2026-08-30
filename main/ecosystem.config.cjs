module.exports = {
  apps: [
    {
      name: "myblog",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3000",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "700M",
      autorestart: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
