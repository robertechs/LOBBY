import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Connect to database
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('🦞 Connected to PostgreSQL');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error);
    throw error;
  }
}

// Disconnect from database
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

// Create a new execution cycle
export async function createCycle(data: {
  cycleNumber: number;
  startTime: Date;
}) {
  return await prisma.round.create({
    data: {
      roundNumber: data.cycleNumber,
      startTime: data.startTime,
      status: 'active',
      championBought: 0,
      totalPotSol: 0,
      championPayout: 0,
      buybackAmount: 0,
      holderRewards: 0,
      nextRoundBoost: 0,
      participants: 0,
    },
  });
}

// Legacy alias
export async function createRound(data: {
  roundNumber: number;
  startTime: Date;
}) {
  return createCycle({ cycleNumber: data.roundNumber, startTime: data.startTime });
}

// Complete an execution cycle
export async function completeCycle(
  cycleNumber: number,
  data: {
    endTime: Date;
    alphaWallet: string | null;
    alphaBought: number;
    totalTankSol: number;
    alphaExtraction: number;
    shatterAmount: number;
    participants: number;
    txAlpha: string | null;
    txShatter: string | null;
  }
) {
  return await prisma.round.update({
    where: { roundNumber: cycleNumber },
    data: {
      endTime: data.endTime,
      championWallet: data.alphaWallet,
      championBought: data.alphaBought,
      totalPotSol: data.totalTankSol,
      championPayout: data.alphaExtraction,
      buybackAmount: data.shatterAmount,
      holderRewards: 0, // Removed in new protocol
      nextRoundBoost: 0, // Removed in new protocol
      participants: data.participants,
      txChampion: data.txAlpha,
      txBuyback: data.txShatter,
      status: 'completed',
    },
  });
}

// Legacy alias
export async function completeRound(
  roundNumber: number,
  data: {
    endTime: Date;
    championWallet: string | null;
    championBought: number;
    totalPotSol: number;
    championPayout: number;
    buybackAmount: number;
    holderRewards: number;
    nextRoundBoost: number;
    participants: number;
    txChampion: string | null;
    txBuyback: string | null;
  }
) {
  return completeCycle(roundNumber, {
    endTime: data.endTime,
    alphaWallet: data.championWallet,
    alphaBought: data.championBought,
    totalTankSol: data.totalPotSol,
    alphaExtraction: data.championPayout,
    shatterAmount: data.buybackAmount,
    participants: data.participants,
    txAlpha: data.txChampion,
    txShatter: data.txBuyback,
  });
}

// Get cycle by number
export async function getCycleByNumber(cycleNumber: number) {
  return await prisma.round.findUnique({
    where: { roundNumber: cycleNumber },
  });
}

// Legacy alias
export async function getRoundByNumber(roundNumber: number) {
  return getCycleByNumber(roundNumber);
}

// Get latest completed cycles
export async function getRecentCycles(limit: number = 10) {
  return await prisma.round.findMany({
    where: { status: 'completed' },
    orderBy: { roundNumber: 'desc' },
    take: limit,
  });
}

// Legacy alias
export async function getRecentRounds(limit: number = 10) {
  return getRecentCycles(limit);
}

// Record a trade
export async function recordTrade(data: {
  roundId: number;
  wallet: string;
  solAmount: number;
  tokenAmount: number;
  txSignature: string;
  timestamp: Date;
}) {
  return await prisma.trade.create({
    data,
  });
}

// Get user's trade history
export async function getUserTrades(wallet: string, limit: number = 50) {
  return await prisma.trade.findMany({
    where: { wallet },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

// Get user's win count
export async function getUserWinCount(wallet: string): Promise<number> {
  return await prisma.round.count({
    where: {
      championWallet: wallet,
      status: 'completed',
    },
  });
}

// Get user's total earnings
export async function getUserTotalEarnings(wallet: string): Promise<number> {
  const result = await prisma.round.aggregate({
    where: {
      championWallet: wallet,
      status: 'completed',
    },
    _sum: {
      championPayout: true,
    },
  });
  return result._sum.championPayout?.toNumber() || 0;
}

// Holder claim functions removed (no longer needed in new protocol)
export async function recordHolderClaim(_data: {
  wallet: string;
  amount: number;
  txSignature: string;
}) {
  // No-op - holder rewards removed
  return null;
}

export async function getHolderClaimHistory(_wallet: string) {
  // No-op - holder rewards removed
  return [];
}
