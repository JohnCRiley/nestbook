module.exports = {
  apps: [{
    name: 'nestbook-api',
    script: './server/index.js',
    cwd: '/opt/nestbook',
    env_file: './server/.env',
    env: {
      NODE_ENV: 'production',
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,

      // STRIPE_MODE is intentionally NOT set here — server/.env is the single
      // source of truth. Set it there and restart PM2 to switch modes.
    }
  }]
}
