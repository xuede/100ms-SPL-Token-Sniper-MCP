import chalk from 'chalk';

export interface SnipeStatus {
  region: string;
  status: string;
  tokenMint: string;
  slippageBps: number;
  timestamp: string;
  error?: string;
  pools?: {
    amm: number;
    serum: number;
  };
  txId?: string;
  timing?: {
    poolFindTime: number;
    txSubmitTime: number;
    txConfirmTime: number;
    totalTime: number;
  };
}

interface RegionStatus {
  region: string;
  status: string;
  latency: number;
  usingFallback: boolean;
  wsConnected: boolean;
}

interface SystemStatus {
  lastTokenMint: string | null;
  status: string;
  regions: RegionStatus[];
  activeTransactions: any[];
}

export class VisualizationManager {
  private lastStatus: SnipeStatus[] = [];
  private lastSystemStatus: SystemStatus | null = null;

  async updateSnipeStatus(results: SnipeStatus[]) {
    this.lastStatus = results;
    await this.visualizeStatus(results);
  }

  async updateStatus(status: SystemStatus) {
    this.lastSystemStatus = status;
    await this.visualizeSystemStatus(status);
  }

  private async visualizeSystemStatus(status: SystemStatus) {
    console.error('\n╔════════════════════════════════════════╗');
    console.error('║          SYSTEM STATUS UPDATE         ║');
    console.error('╚════════════════════════════════════════╝');

    // Display last token and status
    if (status.lastTokenMint) {
      console.error(`${chalk.bold('Last Token:')} ${status.lastTokenMint}`);
    }
    console.error(`${chalk.bold('System Status:')} ${status.status}`);
    
    // Display region statuses
    console.error(`\n${chalk.bold('Region Status:')}`);
    for (const region of status.regions) {
      const statusColor = region.status === 'connected' ? chalk.green : 
                         (region.status === 'degraded' ? chalk.yellow : chalk.red);
      
      console.error(`\n${chalk.bold(region.region)}`);
      console.error(`${chalk.bold('Status:')} ${statusColor(region.status)}`);
      console.error(`${chalk.bold('Latency:')} ${region.latency}ms`);
      console.error(`${chalk.bold('Fallback:')} ${region.usingFallback ? 'Yes' : 'No'}`);
      console.error(`${chalk.bold('WebSocket:')} ${region.wsConnected ? chalk.green('Connected') : chalk.red('Disconnected')}`);
    }
    
    // Display active transactions
    if (status.activeTransactions.length > 0) {
      console.error(`\n${chalk.bold('Active Transactions:')}`);
      for (const tx of status.activeTransactions) {
        const txStatusColor = tx.status === 'success' ? chalk.green : chalk.red;
        
        console.error(`\n${chalk.bold('ID:')} ${tx.id}`);
        console.error(`${chalk.bold('Region:')} ${tx.region}`);
        console.error(`${chalk.bold('Status:')} ${txStatusColor(tx.status)}`);
        console.error(`${chalk.bold('Token:')} ${tx.tokenMint}`);
        console.error(`${chalk.bold('Slippage:')} ${tx.slippageBps/100}%`);
        console.error(`${chalk.bold('Timestamp:')} ${tx.timestamp}`);
      }
    } else {
      console.error(`\n${chalk.bold('No active transactions')}`);
    }
    
    console.error('\n────────────────────────────────────────\n');
  }

  private async visualizeStatus(results: SnipeStatus[]) {
    console.error('\n╔════════════════════════════════════════╗');
    console.error('║          SNIPE STATUS UPDATE           ║');
    console.error('╚════════════════════════════════════════╝');

    for (const result of results) {
      const statusColor = result.status === 'success' ? chalk.green : chalk.red;
      
      console.error(`${chalk.bold('Region:')} ${result.region}`);
      console.error(`${chalk.bold('Status:')} ${statusColor(result.status)}`);
      console.error(`${chalk.bold('Token:')} ${result.tokenMint}`);
      console.error(`${chalk.bold('Slippage:')} ${result.slippageBps/100}%`);
      
      if (result.timing) {
        console.error(`\n${chalk.bold('Performance Metrics:')}`);
        console.error(`${chalk.bold('Pool Finding Time:')} ${result.timing.poolFindTime}ms`);
        console.error(`${chalk.bold('Transaction Submit Time:')} ${result.timing.txSubmitTime}ms`);
        console.error(`${chalk.bold('Transaction Confirm Time:')} ${result.timing.txConfirmTime}ms`);
        console.error(`${chalk.bold('Total Time:')} ${result.timing.totalTime}ms`);
        
        if (result.timing.totalTime > 0) {
          // Add performance analysis
          if (result.timing.totalTime < 500) {
            console.error(`${chalk.green.bold('🚀 Ultra-fast execution!')}`);
          } else if (result.timing.totalTime < 1000) {
            console.error(`${chalk.green.bold('⚡ Fast execution')}`);
          } else if (result.timing.totalTime < 2000) {
            console.error(`${chalk.yellow.bold('🏃 Average execution speed')}`);
          } else {
            console.error(`${chalk.red.bold('🐢 Slow execution - Consider optimizing connections')}`);
          }
        }
      }
      
      if (result.pools) {
        console.error(`\n${chalk.bold('Pools Found:')}`);
        console.error(`${chalk.bold('AMM Pools:')} ${result.pools.amm}`);
        console.error(`${chalk.bold('Serum Markets:')} ${result.pools.serum}`);
      }
      
      if (result.error) {
        console.error(`\n${chalk.bold.red('Error:')}`);
        console.error(`${chalk.red(result.error)}`);
      }
      
      if (result.txId) {
        console.error(`\n${chalk.bold('Transaction:')}`);
        console.error(`${chalk.bold('ID:')} ${result.txId}`);
        console.error(`${chalk.bold('Solscan:')} https://solscan.io/tx/${result.txId}`);
      }
      
      console.error('\n────────────────────────────────────────\n');
    }
    
    // Add suggestions for improvement if applicable
    if (results.some(r => r.status === 'error')) {
      console.error(chalk.yellow('💡 Suggestions for improvement:'));
      console.error(chalk.yellow('- Ensure your wallet has sufficient SOL'));
      console.error(chalk.yellow('- Check RPC connection quality'));
      console.error(chalk.yellow('- Try a different slippage value'));
      console.error(chalk.yellow('- Consider using gRPC for faster connections'));
    }
  }
  
  getLastStatus(): SnipeStatus[] {
    return this.lastStatus;
  }
  
  getLastSystemStatus(): SystemStatus | null {
    return this.lastSystemStatus;
  }
}
