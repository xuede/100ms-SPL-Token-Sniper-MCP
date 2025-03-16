import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class ConfigureParametersTool {
  constructor(private state: any) {}

  async execute(args: { slippage?: number; minProfit?: number; maxGas?: number; timeout?: number }) {
    try {
      const updates: string[] = [];

      if (typeof args.slippage === 'number') {
        if (args.slippage < 0 || args.slippage > 100) {
          throw new McpError(ErrorCode.InvalidParams, 'Slippage must be between 0 and 100');
        }
        this.state.slippageBps = Math.floor(args.slippage * 100);
        updates.push(`Slippage set to ${args.slippage}%`);
      }

      if (typeof args.minProfit === 'number') {
        if (args.minProfit < 0) {
          throw new McpError(ErrorCode.InvalidParams, 'Minimum profit must be non-negative');
        }
        this.state.minProfitSol = args.minProfit;
        updates.push(`Minimum profit set to ${args.minProfit} SOL`);
      }

      if (typeof args.maxGas === 'number') {
        if (args.maxGas < 0) {
          throw new McpError(ErrorCode.InvalidParams, 'Maximum gas must be non-negative');
        }
        this.state.maxGasSol = args.maxGas;
        updates.push(`Maximum gas set to ${args.maxGas} SOL`);
      }

      if (typeof args.timeout === 'number') {
        if (args.timeout < 0) {
          throw new McpError(ErrorCode.InvalidParams, 'Timeout must be non-negative');
        }
        this.state.timeoutMs = args.timeout;
        updates.push(`Timeout set to ${args.timeout}ms`);
      }

      if (updates.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No parameters were updated. Current configuration:\n' +
                    `Slippage: ${this.state.slippageBps/100}%\n` +
                    `Minimum Profit: ${this.state.minProfitSol} SOL\n` +
                    `Maximum Gas: ${this.state.maxGasSol} SOL\n` +
                    `Timeout: ${this.state.timeoutMs}ms`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Updated parameters:\n' + updates.join('\n')
          }
        ]
      };
    } catch (error: unknown) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to configure parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
