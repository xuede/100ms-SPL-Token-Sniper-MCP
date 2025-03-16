import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { RegionManager } from '../lib/region-manager.js';
import { TokenParser } from '../lib/token-parser.js';
import { VisualizationManager, SnipeStatus } from '../lib/visualization-manager.js';
import { CloudManager } from '../lib/cloud-manager.js';

export class SnipeTokenTool {
  private cloudManager: CloudManager;
  
  constructor(
    private state: any,
    private regionManager: RegionManager,
    private tokenParser: TokenParser,
    private visualizationManager: VisualizationManager
  ) {
    this.cloudManager = new CloudManager();
  }

  async execute(args: { token: string; slippage?: number; regions?: string[]; amountSol?: number }) {
    try {
      const { token, slippage, regions, amountSol = 0.05 } = args;

      // Parse token input (address or natural language)
      const tokenMint = await this.tokenParser.parse(token);
      if (!tokenMint) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid token input');
      }

      // Update state
      this.state.lastTokenMint = tokenMint;
      this.state.lastStatus = 'sniping';

      // Configure parameters
      const slippageBps = slippage ? Math.floor(slippage * 100) : this.state.slippageBps;
      
      // Determine cloud regions to use
      const availableRegions = this.cloudManager.getAvailableRegions();
      const targetRegions = regions || this.state.regions || [];
      const cloudRegions = targetRegions.filter((r: string) => availableRegions.includes(r));
      
      // If no regions explicitly specified but we have available cloud regions, use all of them
      if (cloudRegions.length === 0 && availableRegions.length > 0) {
        cloudRegions.push(...availableRegions);
      }
      
      console.error(`[MCP] Using cloud execution in regions: ${cloudRegions.join(', ')}`);
      
      // ONLY use cloud execution - never fall back to local execution
      const results = await this.cloudManager.snipeTokenInAllRegions(
        tokenMint,
        slippageBps,
        amountSol,
        cloudRegions
      );

      // Update visualization
      await this.visualizationManager.updateSnipeStatus(results);

      // Prepare the response message
      const fastestRegion = results.reduce((fastest: SnipeStatus | null, current: SnipeStatus) => {
        if (current.status !== 'success') return fastest;
        if (!fastest) return current;
        if (current.timing?.totalTime && fastest.timing?.totalTime && 
            current.timing.totalTime < fastest.timing.totalTime) {
          return current;
        }
        return fastest;
      }, null);
      
      const successCount = results.filter(r => r.status === 'success').length;
      let responseText = `Started sniping ${token} with ${slippageBps / 100}% slippage in regions: ${cloudRegions.join(', ')}`;
      
      if (successCount > 0 && fastestRegion) {
        responseText += `\n\nSuccessful execution in ${successCount}/${results.length} regions.`;
        
        if (fastestRegion.timing) {
          responseText += `\nFastest region: ${fastestRegion.region} (${fastestRegion.timing.totalTime}ms)`;
          responseText += `\nTransaction ID: ${fastestRegion.txId}`;
          
          if (fastestRegion.timing.poolFindTime) {
            responseText += `\n\nPerformance metrics:`;
            responseText += `\n- Pool finding: ${fastestRegion.timing.poolFindTime}ms`;
            responseText += `\n- Transaction submission: ${fastestRegion.timing.txSubmitTime}ms`;
            responseText += `\n- Transaction confirmation: ${fastestRegion.timing.txConfirmTime}ms`;
            responseText += `\n- Total execution time: ${fastestRegion.timing.totalTime}ms`;
          }
        }
      } else {
        // All regions failed
        responseText += `\n\nExecution failed in all regions.`;
        if (results[0]?.error) {
          responseText += `\nError: ${results[0].error}`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error: unknown) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to snipe token: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
