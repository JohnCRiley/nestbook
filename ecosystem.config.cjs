module.exports = {
  apps: [{
    name: 'nestbook-api',
    script: './server/index.js',
    cwd: '/opt/nestbook',
    env_file: './server/.env',
    env: {
      NODE_ENV: 'production',
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    }
  }]
}
