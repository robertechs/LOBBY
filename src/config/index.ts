import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  // Solana
  solanaRpcUrl: requireEnv('SOLANA_RPC_URL'),
  creatorPrivateKey: requireEnv('CREATOR_PRIVATE_KEY'),
  backendPrivateKey: requireEnv('BACKEND_WALLET_PRIVATE_KEY'),
  
  // Token
  moltdownTokenMint: requireEnv('MOLTDOWN_TOKEN_MINT'),
  
  // Database
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
  
  // External APIs
  pumpStreamWsUrl: optionalEnv('PUMPSTREAM_WS_URL', 'wss://pumpportal.fun/api/data'),
  pumpPortalApiUrl: optionalEnv('PUMPPORTAL_API_URL', 'https://pumpportal.fun/api'),
  
  // Server
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  
  // Execution cycle configuration (The Boil Protocol)
  cycleDurationMs: parseInt(optionalEnv('CYCLE_DURATION_MS', '60000'), 10), // 60 seconds
  
  // Solana constants
  lamportsPerSol: 1_000_000_000,
  
  // Burn address (Solana's system program - tokens sent here are effectively burned)
  burnAddress: '11111111111111111111111111111111',
} as const;

export type Config = typeof config;

