module.exports = {
  apps: [
    {
      name: "smokemon",
      script: "node ./index.js",
      cwd: "/home/node/smokemon/",
      watch: true,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ]
};
