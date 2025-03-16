import { gql, GraphQLClient } from 'graphql-request';
import dotenv from 'dotenv';
dotenv.config();
// Initialize Shyft clients with optimized settings
const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const graphQLClient = new GraphQLClient(`https://programs.shyft.to/v0/graphql?api_key=${SHYFT_API_KEY}`, {
    timeout: 2000 // 2s timeout
});
// Minimal GraphQL query
const POOL_QUERY = gql `
  query GetPoolByToken($tokenMint: String!) {
    Raydium_LiquidityPoolv4(where: { baseMint: { _eq: $tokenMint } }) {
      pubkey marketId marketProgramId baseVault quoteVault openOrders targetOrders
    }
  }
`;
export class ShyftMarket {
    constructor() {
        this.REST_API_URL = `https://api.shyft.to/sol/v1/raydium/pool`;
    }
    /**
     * Fetch pool info using REST API as a fallback
     */
    async getPoolInfoREST(tokenMint) {
        try {
            const url = `${this.REST_API_URL}/${tokenMint}?api_key=${SHYFT_API_KEY}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`REST API error: ${response.status}`);
            }
            const data = await response.json();
            if (!data.result) {
                return null;
            }
            return {
                pubkey: data.result.address,
                marketId: data.result.marketId,
                marketProgramId: data.result.marketProgramId,
                baseVault: data.result.baseVault,
                quoteVault: data.result.quoteVault,
                openOrders: data.result.openOrders,
                targetOrders: data.result.targetOrders
            };
        }
        catch (error) {
            console.error('REST API error:', error);
            return null;
        }
    }
    /**
     * Fetch pool info using Shyft GraphQL with aggressive polling
     */
    async pollPoolInfo(tokenMint, signal) {
        let restAttempted = false;
        while (!signal.aborted) {
            try {
                // Try GraphQL first
                const response = await graphQLClient.request(POOL_QUERY, { tokenMint });
                const pool = response?.Raydium_LiquidityPoolv4?.[0];
                if (pool) {
                    console.error('Pool found via GraphQL polling');
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
                        console.error('Pool found via REST API');
                        return restPool;
                    }
                }
                // Aggressive polling - 50ms delay between attempts
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            catch (error) {
                console.error('GraphQL error:', error);
                // Try REST API once if GraphQL fails
                if (!restAttempted) {
                    restAttempted = true;
                    const restPool = await this.getPoolInfoREST(tokenMint);
                    if (restPool) {
                        console.error('Pool found via REST API');
                        return restPool;
                    }
                }
                // On error, keep polling after delay
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        return null;
    }
}
