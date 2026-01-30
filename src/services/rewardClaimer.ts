import { VersionedTransaction } from '@solana/web3.js';
import { config } from '../config';
import { getCreatorWallet, connection } from '../utils/solana';

interface ClaimResult {
  success: boolean;
  txSignature?: string;
  error?: string;
}

/**
 * Claim creator fees from pump.fun using PumpPortal API
 */
export async function claimCreatorFees(): Promise<ClaimResult> {
  try {
    const creatorWallet = getCreatorWallet();
    const walletAddress = creatorWallet.publicKey.toString();
    
    console.log(`\n💰 Claiming creator fees for ${walletAddress}...`);
    console.log(`Token: ${config.moltdownTokenMint}`);

    // Use PumpPortal's trade-local endpoint with collectCreatorFee action
    const response = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: walletAddress,
        action: 'collectCreatorFee',
        mint: config.moltdownTokenMint,
        priorityFee: 0.0001,
        pool: 'pump', // or 'pumpswap' if graduated
      }),
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewardClaimer.ts:response',message:'PumpPortal claim response',data:{status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CLAIM'})}).catch(()=>{});
    // #endregion

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claim API error:', errorText);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewardClaimer.ts:error',message:'Claim API failed',data:{status:response.status,error:errorText},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CLAIM'})}).catch(()=>{});
      // #endregion
      
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    // Response should be raw transaction bytes
    const txBytes = await response.arrayBuffer();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewardClaimer.ts:txBytes',message:'Got claim tx bytes',data:{bytesLength:txBytes.byteLength},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CLAIM'})}).catch(()=>{});
    // #endregion

    if (txBytes.byteLength < 100) {
      // Probably an error message, not a transaction
      const text = new TextDecoder().decode(txBytes);
      console.error('Unexpected response:', text);
      return { success: false, error: `Unexpected response: ${text}` };
    }

    // Deserialize and sign the transaction
    const transaction = VersionedTransaction.deserialize(new Uint8Array(txBytes));
    transaction.sign([creatorWallet]);
    
    console.log('📤 Sending claim transaction...');
    
    // Send transaction
    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });
    
    console.log(`📝 Claim tx sent: ${txSignature}`);
    
    // Confirm
    const latestBlockHash = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txSignature,
    }, 'confirmed');
    
    if (confirmation.value.err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewardClaimer.ts:failed',message:'Claim tx failed on-chain',data:{error:String(confirmation.value.err)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CLAIM'})}).catch(()=>{});
      // #endregion
      return { success: false, error: 'Transaction failed on-chain', txSignature };
    }
    
    console.log(`✅ Creator fees claimed! Tx: ${txSignature}`);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewardClaimer.ts:success',message:'Claim SUCCESS',data:{txSignature},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CLAIM'})}).catch(()=>{});
    // #endregion
    
    return { success: true, txSignature };
  } catch (error) {
    console.error('Claim failed:', error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rewardClaimer.ts:exception',message:'Claim exception',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CLAIM'})}).catch(()=>{});
    // #endregion
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}


