import { RegionManager } from '../lib/region-manager.js';
import { VisualizationManager } from '../lib/visualization-manager.js';

interface Transaction {
  id: string;
  region: string;
  status: string;
  tokenMint: string;
  slippageBps: number;
  timestamp: string;
}

export class StatusTool {
  constructor(
    private state: any,
    private regionManager: RegionManager,
    private visualizationManager: VisualizationManager
  ) {}

  async execute(args: {}) {
    const entries = Array.from(this.state.activeTransactions.entries()) as [string, any][];
    
    const status = {
      lastTokenMint: this.state.lastTokenMint,
      status: this.state.lastStatus,
      regions: await this.regionManager.getRegionStatuses(),
      activeTransactions: entries.map(([txId, tx]) => ({
        id: txId,
        region: tx.region,
        status: tx.status,
        tokenMint: tx.tokenMint,
        slippageBps: tx.slippageBps,
        timestamp: tx.timestamp
      } as Transaction))
    };

    // Update visualization
    await this.visualizationManager.updateStatus(status);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2)
        }
      ]
    };
  }
}
