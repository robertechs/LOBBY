import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { config } from '../config';

// Initialize connection
export const connection = new Connection(config.solanaRpcUrl, 'confirmed');

// Load keypair from base58 private key
export function loadKeypair(privateKeyBase58: string): Keypair {
  const privateKey = bs58.decode(privateKeyBase58);
  return Keypair.fromSecretKey(privateKey);
}

// Get backend wallet keypair
export function getBackendWallet(): Keypair {
  return loadKeypair(config.backendPrivateKey);
}

// Get creator wallet keypair
export function getCreatorWallet(): Keypair {
  return loadKeypair(config.creatorPrivateKey);
}

// Send SOL to a wallet
export async function sendSol(
  fromKeypair: Keypair,
  toAddress: string,
  amountSol: number
): Promise<string> {
  const toPublicKey = new PublicKey(toAddress);
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    fromKeypair,
  ]);

  console.log(`Sent ${amountSol} SOL to ${toAddress}. Tx: ${signature}`);
  return signature;
}

// Burn tokens
export async function burnTokens(
  ownerKeypair: Keypair,
  mintAddress: string,
  amount: number
): Promise<string> {
  const mint = new PublicKey(mintAddress);
  const tokenAccount = await getAssociatedTokenAddress(
    mint,
    ownerKeypair.publicKey
  );

  const transaction = new Transaction().add(
    createBurnInstruction(
      tokenAccount,
      mint,
      ownerKeypair.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    ownerKeypair,
  ]);

  console.log(`Burned ${amount} tokens. Tx: ${signature}`);
  return signature;
}

// Get SOL balance
export async function getSolBalance(address: string): Promise<number> {
  const publicKey = new PublicKey(address);
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

// Get token balance
export async function getTokenBalance(
  walletAddress: string,
  mintAddress: string
): Promise<number> {
  const wallet = new PublicKey(walletAddress);
  const mint = new PublicKey(mintAddress);
  const tokenAccount = await getAssociatedTokenAddress(mint, wallet);

  try {
    const balance = await connection.getTokenAccountBalance(tokenAccount);
    return parseFloat(balance.value.amount);
  } catch {
    return 0;
  }
}

// Shorten address for display
export function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Convert lamports to SOL
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

// Convert SOL to lamports
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

