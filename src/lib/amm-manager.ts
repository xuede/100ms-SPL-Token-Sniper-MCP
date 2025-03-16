import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

interface ProgramAccount {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
}

export class AmmManager {
  private readonly RAYDIUM_PROGRAM_ID = process.env.RAYDIUM_PROGRAM_ID!;
  private readonly MIN_AMM_DATA_SIZE = Number(process.env.MIN_AMM_DATA_SIZE) || 300;

  async findPools(connection: Connection, tokenMint: PublicKey): Promise<ProgramAccount[]> {
    try {
      console.error('Fetching Raydium AMM accounts...');

      // Get all program accounts
      const accounts = await connection.getProgramAccounts(
        new PublicKey(this.RAYDIUM_PROGRAM_ID),
        {
          commitment: 'processed',
          filters: [
            {
              dataSize: this.MIN_AMM_DATA_SIZE
            }
          ]
        }
      );

      // Filter accounts that contain the token mint
      const pools = accounts.filter(account => {
        try {
          const data = account.account.data;
          const mintA = new PublicKey(data.slice(8, 40));
          const mintB = new PublicKey(data.slice(40, 72));
          return mintA.equals(tokenMint) || mintB.equals(tokenMint);
        } catch (error) {
          return false;
        }
      });

      console.error(`Found ${pools.length} Raydium pools for token ${tokenMint.toBase58()}`);
      return pools;

    } catch (error: any) {
      // Check if error is due to disabled RPC method
      if (error.message?.includes('410') || error.message?.includes('disabled')) {
        console.error('RPC endpoint does not support getProgramAccounts, trying alternative method...');
        try {
          // Try alternative method using getTokenAccountsByOwner
          const tokenAccounts = await connection.getTokenAccountsByOwner(
            new PublicKey(this.RAYDIUM_PROGRAM_ID),
            {
              programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
            }
          );

          const pools = tokenAccounts.value.filter(account => {
            try {
              const data = account.account.data;
              return data.length >= this.MIN_AMM_DATA_SIZE;
            } catch (error) {
              return false;
            }
          });

          console.error(`Found ${pools.length} Raydium pools using alternative method`);
          return pools;

        } catch (altError: any) {
          throw new Error(`Failed to find Raydium pools (alternative method): ${altError.message}`);
        }
      }

      throw new Error(`Failed to find Raydium pools: ${error.message}`);
    }
  }
}
