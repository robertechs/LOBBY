import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from '../config';
import { protocolRouter } from './routes/protocol';
import { leaderboardRouter } from './routes/leaderboard';
import { userRouter } from './routes/user';
import { testRouter } from './routes/test';
import { agentRouter } from './routes/agent';

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // 120 requests per minute per IP

function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: 'Too many requests, please slow down' });
    return;
  }
  
  record.count++;
  next();
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 300000);

export function createServer(): Express {
  const app = express();

  // Trust proxy for correct IP detection behind load balancers
  app.set('trust proxy', 1);

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(rateLimiter);

  // Add cache headers for API responses
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'public, max-age=2'); // Cache for 2 seconds
    next();
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: 'ok', 
      protocol: 'moltdown',
      version: '2.0.0',
      timestamp: new Date().toISOString() 
    });
  });

  // API routes - The Boil Protocol
  app.use('/api/protocol', protocolRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/user', userRouter);
  app.use('/api/agent', agentRouter); // Agent-friendly endpoints
  app.use('/api/test', testRouter); // Test endpoints

  // Legacy routes (backward compatibility)
  app.use('/api/round', protocolRouter);

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

export function startServer(): void {
  const app = createServer();

  app.listen(config.port, () => {
    console.log(`🦞 Moltdown API server running on port ${config.port}`);
  });
}
