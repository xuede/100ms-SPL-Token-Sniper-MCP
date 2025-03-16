import { gql, GraphQLClient } from 'graphql-request';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Shyft clients with optimized settings
const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const graphQLClient = new GraphQLClient(`https://programs.shyft.to/v0/graphql?api_key=${SHYFT_API_KEY}`, {
  timeout: 2000 // 2s timeout
});

// Minimal GraphQL query
const POOL_QUERY = gql`
  query GetPoolByToken($tokenMint: String!) {
    Raydium_LiquidityPoolv4(where: { baseMint: { _eq: $tokenMint } }) {
      pubkey marketId marketProgramId baseVault quoteVault openOrders targetOrders
    }
  }
`;

export interface PoolInfo {
  pubkey: string;
  marketId: string;
  marketProgramId: string;
  baseVault: string;
  quoteVault: string;
  openOrders: string;
  targetOrders: string;
}

export class ShyftMarket {
  private readonly REST_API_URL = `https://api.shyft.to/sol/v1/raydium/pool`;
  private pollCount = 0;
  private lastLogTime = 0;

  /**
   * Fetch pool info using REST API as a fallback
   */
  private async getPoolInfoREST(tokenMint: string): Promise<PoolInfo | null> {
    try {
      console.error(`[GraphQL] Trying REST API fallback for token: ${tokenMint}`);
      const url = `${this.REST_API_URL}/${tokenMint}?api_key=${SHYFT_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[GraphQL] REST API error: ${response.status}`);
        return null;
      }
      const data = await response.json();
      if (!data.result) {
        console.error(`[GraphQL] REST API found no pools`);
        return null;
      }
      console.error(`[GraphQL] REST API found pool: ${data.result.address}`);
      return {
        pubkey: data.result.address,
        marketId: data.result.marketId,
        marketProgramId: data.result.marketProgramId,
        baseVault: data.result.baseVault,
        quoteVault: data.result.quoteVault,
        openOrders: data.result.openOrders,
        targetOrders: data.result.targetOrders
      };
    } catch (error) {
      console.error('[GraphQL] REST API error:', error);
      return null;
    }
  }

  /**
   * Fetch pool info using Shyft GraphQL with aggressive polling
   */
  async pollPoolInfo(tokenMint: string, signal: AbortSignal): Promise<PoolInfo | null> {
    console.error(`[GraphQL] Starting pool search for token: ${tokenMint}`);
    let restAttempted = false;
    this.pollCount = 0;
    this.lastLogTime = Date.now();

    while (!signal.aborted) {
      try {
        // Try GraphQL first
        this.pollCount++;
        
        // Log progress every second to avoid flooding logs
        const now = Date.now();
        if (now - this.lastLogTime > 1000) {
          console.error(`[GraphQL] Poll count: ${this.pollCount}, still searching...`);
          this.lastLogTime = now;
        }
        
        const response = await graphQLClient.request(POOL_QUERY, { tokenMint });
        const pool = response?.Raydium_LiquidityPoolv4?.[0];
        
        if (pool) {
          console.error(`[GraphQL] Found pool via GraphQL after ${this.pollCount} attempts: ${pool.pubkey}`);
          return {
            pubkey: pool.pubkey,
            marketId: pool.marketId,
            marketProgramId: pool.marketProgramId,
            openOrders: pool.openOrders,
            targetOrders: pool.targetOrders,
            baseVault: pool.baseVault,
            quoteVault: pool.quoteVault
          };
        }

        // Try REST API once if GraphQL fails to find pool
        if (!restAttempted) {
          restAttempted = true;
          const restPool = await this.getPoolInfoREST(tokenMint);
          if (restPool) {
            console.error('[GraphQL] Pool found via REST API');
            return restPool;
          }
        }
        
        // Aggressive polling - 50ms delay between attempts
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error('[GraphQL] Query error:', error);
        
        // Try REST API once if GraphQL fails
        if (!restAttempted) {
          restAttempted = true;
          const restPool = await this.getPoolInfoREST(tokenMint);
          if (restPool) {
            console.error('[GraphQL] Pool found via REST API (after GraphQL error)');
            return restPool;
          }
        }

        // On error, keep polling after delay
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.error(`[GraphQL] Search aborted after ${this.pollCount} attempts`);
    return null;
  }
}
