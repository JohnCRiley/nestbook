module.exports = {
  apps: [{
    name: 'nestbook-api',
    script: './server/index.js',
    cwd: '/opt/nestbook',
    env_file: './server/.env',
    env: {
      NODE_ENV: 'production',
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,

      // Stripe mode — production is always 'live'.
      // To test Connect onboarding on STAGING, change to 'test' and restart.
      // Never set 'test' on the production server.
      // Sandbox fake KYC values: https://stripe.com/docs/connect/testing
      // Key values (STRIPE_SECRET_KEY, STRIPE_TEST_SECRET_KEY, etc.) come
      // from env_file (server/.env) — PM2 env_file is reliable; only the
      // process.env.X passthrough syntax in this block is unreliable.
      STRIPE_MODE: 'live',
    }
  }]
}
