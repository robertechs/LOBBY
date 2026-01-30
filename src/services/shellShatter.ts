import { config } from '../config';
import { getCreatorWallet, getTokenBalance, connection } from '../utils/solana';
import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

interface SwapResult {
  success: boolean;
  txSignature?: string;
  error?: string;
}

/**
 * Buy tokens directly from pump.fun bonding curve
 */
async function buyTokensViaPumpPortal(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number
): Promise<SwapResult> {
  try {
    console.log(`🔄 Buying from pump.fun: ${solAmount} SOL -> ${tokenMint.slice(0, 8)}...`);

    // Use pump.fun's direct swap API
    const response = await fetch('https://pump.fun/api/trade', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toString(),
        action: 'buy',
        mint: tokenMint,
        amount: solAmount,
        denominatedInSol: true,
        slippage: 0.25, // 25%
        priorityFee: 0.0005,
      }),
    });

    if (!response.ok) {
      // If pump.fun API fails, try pumpportal.fun as backup
      console.log('pump.fun API failed, trying pumpportal.fun...');
      
      const backupResponse = await fetch('https://pumpportal.fun/api/trade-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: wallet.publicKey.toString(),
          action: 'buy',
          mint: tokenMint,
          amount: solAmount,
          denominatedInSol: 'true',
          slippage: 25,
          priorityFee: 0.0005,
          pool: 'pump',
        }),
      });

      if (!backupResponse.ok) {
        const errorText = await backupResponse.text();
        return { success: false, error: `All swap APIs failed: ${errorText}` };
      }

      // Process backup response
      const txBytes = await backupResponse.arrayBuffer();
      const transaction = VersionedTransaction.deserialize(new Uint8Array(txBytes));
      transaction.sign([wallet]);
      
      const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });
      
      await connection.confirmTransaction(txSignature, 'confirmed');
      
      return { success: true, txSignature };
    }

    // Process pump.fun response (returns transaction bytes)
    const txBytes = await response.arrayBuffer();

    const transaction = VersionedTransaction.deserialize(new Uint8Array(txBytes));
    transaction.sign([wallet]);
    
    console.log('📤 Sending swap transaction...');
    
    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });
    
    console.log(`📝 Tx sent: ${txSignature}`);
    
    const latestBlockHash = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txSignature,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      return { success: false, error: 'Transaction failed on-chain', txSignature };
    }
    
    console.log(`✅ Swap confirmed: ${txSignature}`);
    
    return { success: true, txSignature };
  } catch (error) {
    console.error('Swap failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute Shell Shatter - The Boil Protocol's buyback & burn mechanism
 * 1. Buy $SHELLOUT tokens with SOL
 * 2. Burn the purchased tokens (shatter the shells)
 */
export async function executeShellShatter(
  solAmount: number
): Promise<string> {
  console.log(`\n🔥 Starting Shell Shatter with ${solAmount.toFixed(4)} SOL`);

  // Minimum amount to execute (to avoid dust transactions)
  if (solAmount < 0.001) {
    console.log('Amount too small for Shell Shatter, skipping');
    return '';
  }

  const creatorWallet = getCreatorWallet();
  const walletAddress = creatorWallet.publicKey.toString();

  // Get token balance before
  const balanceBefore = await getTokenBalance(
    walletAddress,
    config.moltdownTokenMint
  );

  console.log(`📊 Token balance before: ${balanceBefore}`);

  // Step 1: Buy $SHELLOUT tokens with SOL
  console.log('🛒 Executing buy for Shell Shatter...');

  const swapResult = await buyTokensViaPumpPortal(
    creatorWallet,
    config.moltdownTokenMint,
    solAmount
  );

  if (!swapResult.success) {
    console.error(`❌ Shell Shatter buy failed: ${swapResult.error}`);
    return '';
  }

  console.log(`✅ Buy successful. Tx: ${swapResult.txSignature}`);
  
  // Wait for transaction to settle
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Get token balance after buy
  const balanceAfter = await getTokenBalance(
    walletAddress,
    config.moltdownTokenMint
  );

  const tokensBought = balanceAfter - balanceBefore;
  console.log(`📊 Tokens bought: ${tokensBought}`);

  // Step 2: Burn the tokens (shatter the shells)
  if (tokensBought > 0) {
    console.log('💥 Shattering shells (burning tokens)...');
    try {
      const burnTx = await burnTokens(
        creatorWallet,
        config.moltdownTokenMint,
        tokensBought
      );
      console.log(`💥 Shattered ${tokensBought} tokens. Tx: ${burnTx}`);
      return burnTx;
    } catch (error) {
      console.error('❌ Shell Shatter burn failed:', error);
      // Return buy tx even if burn fails - tokens are still off market
      return swapResult.txSignature || '';
    }
  }

  return swapResult.txSignature || '';
}

/**
 * Burn tokens using SPL Token burn instruction
 * Tries Token2022 first (pump.fun uses this), falls back to regular SPL
 */
async function burnTokens(
  ownerKeypair: Keypair,
  mintAddress: string,
  amount: number
): Promise<string> {
  const mint = new PublicKey(mintAddress);
  
  // Try Token2022 first (pump.fun uses this)
  try {
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      ownerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Check if the token account exists
    const accountInfo = await connection.getAccountInfo(tokenAccount);
    if (!accountInfo) {
      throw new Error('Token account not found for Token2022');
    }

    const burnIx = createBurnInstruction(
      tokenAccount,
      mint,
      ownerKeypair.publicKey,
      BigInt(Math.floor(amount)),
      [],
      TOKEN_2022_PROGRAM_ID
    );

    const transaction = new Transaction().add(burnIx);
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerKeypair.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [ownerKeypair]
    );

    console.log(`✅ Token2022 burn successful`);
    return signature;
  } catch (error) {
    // Fallback to regular SPL token
    console.log('Token2022 burn failed, trying SPL token...');
    
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      ownerKeypair.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const burnIx = createBurnInstruction(
      tokenAccount,
      mint,
      ownerKeypair.publicKey,
      BigInt(Math.floor(amount)),
      [],
      TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction().add(burnIx);
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerKeypair.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [ownerKeypair]
    );

    console.log(`✅ SPL token burn successful`);
    return signature;
  }
}

/**
 * Get current Shell Shatter stats
 */
export async function getShatterStats() {
  const creatorWallet = getCreatorWallet();
  const tokenBalance = await getTokenBalance(
    creatorWallet.publicKey.toString(),
    config.moltdownTokenMint
  );

  return {
    walletAddress: creatorWallet.publicKey.toString(),
    tokenBalance,
  };
}
