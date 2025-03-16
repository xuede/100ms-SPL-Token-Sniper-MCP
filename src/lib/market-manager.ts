import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

interface ProgramAccount {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
}

export class MarketManager {
  private readonly SERUM_PROGRAM_ID = 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX';
  private readonly MIN_MARKET_SIZE = 300;

  async findMarkets(connection: Connection, tokenMint: PublicKey): Promise<ProgramAccount[]> {
    try {
      console.error('Fetching Serum market accounts...');

      // Get all program accounts
      const accounts = await connection.getProgramAccounts(
        new PublicKey(this.SERUM_PROGRAM_ID),
        {
          commitment: 'processed',
          filters: [
            {
              dataSize: this.MIN_MARKET_SIZE
            }
          ]
        }
      );

      // Filter accounts that contain the token mint
      const markets = accounts.filter(account => {
        try {
          const data = account.account.data;
          const baseMint = new PublicKey(data.slice(5, 37));
          return baseMint.equals(tokenMint);
        } catch (error) {
          return false;
        }
      });

      console.error(`Found ${markets.length} Serum markets for token ${tokenMint.toBase58()}`);
      return markets;

    } catch (error: any) {
      // Check if error is due to disabled RPC method
      if (error.message?.includes('410') || error.message?.includes('disabled')) {
        console.error('RPC endpoint does not support getProgramAccounts, trying alternative method...');
        try {
          // Try alternative method using getTokenAccountsByOwner
          const tokenAccounts = await connection.getTokenAccountsByOwner(
            new PublicKey(this.SERUM_PROGRAM_ID),
            {
              programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
            }
          );

          const markets = tokenAccounts.value.filter(account => {
            try {
              const data = account.account.data;
              return data.length >= this.MIN_MARKET_SIZE;
            } catch (error) {
              return false;
            }
          });

          console.error(`Found ${markets.length} Serum markets using alternative method`);
          return markets;

        } catch (altError: any) {
          throw new Error(`Failed to find Serum markets (alternative method): ${altError.message}`);
        }
      }

      throw new Error(`Failed to find Serum markets: ${error.message}`);
    }
  }
}
