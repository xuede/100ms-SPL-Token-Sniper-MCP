// Mock implementation of configure_parameters tool for demo purposes

// Define local interface to match expected MCP response structure
interface McpToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

// Mock global parameters that will be updated by the configure tool
let mockParameters = {
  defaultSlippageBps: 100, // 1%
  defaultAmountSol: 0.05,
  gasPriority: 'Medium',
  maxRetries: 3,
  regions: ['US', 'ASIA', 'EUROPE']
};

export async function mockConfigureParameters(
  args: { defaultSlippageBps?: number; defaultAmountSol?: number; gasPriority?: string; }
): Promise<McpToolResponse> {
  // Log the original parameters for reference
  console.log(`[MOCK] Original parameters: ${JSON.stringify(mockParameters)}`);
  
  // Track which parameters were updated
  const updates: string[] = [];
  
  // Update slippage if provided
  if (args.defaultSlippageBps !== undefined) {
    // Validate slippage (between 0 and 5000 basis points - 0% to 50%)
    if (args.defaultSlippageBps < 0 || args.defaultSlippageBps > 5000) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Invalid slippage value: ${args.defaultSlippageBps} basis points. Must be between 0 and 5000 (0% to 50%).`
          }
        ],
        isError: true
      };
    }
    
    // Update the parameter
    mockParameters.defaultSlippageBps = args.defaultSlippageBps;
    updates.push(`Default slippage set to ${args.defaultSlippageBps / 100}%`);
  }
  
  // Update SOL amount if provided
  if (args.defaultAmountSol !== undefined) {
    // Validate amount (between 0.01 and 10 SOL)
    if (args.defaultAmountSol < 0.01 || args.defaultAmountSol > 10) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Invalid SOL amount: ${args.defaultAmountSol} SOL. Must be between 0.01 and 10 SOL.`
          }
        ],
        isError: true
      };
    }
    
    // Update the parameter
    mockParameters.defaultAmountSol = args.defaultAmountSol;
    updates.push(`Default SOL amount set to ${args.defaultAmountSol} SOL`);
  }
  
  // Update gas priority if provided
  if (args.gasPriority !== undefined) {
    // Validate priority
    const validPriorities = ['Low', 'Medium', 'High', 'Extreme'];
    if (!validPriorities.includes(args.gasPriority)) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Invalid gas priority: ${args.gasPriority}. Must be one of: ${validPriorities.join(', ')}.`
          }
        ],
        isError: true
      };
    }
    
    // Update the parameter
    mockParameters.gasPriority = args.gasPriority;
    updates.push(`Gas priority set to ${args.gasPriority}`);
  }
  
  // If no updates were made, return a message
  if (updates.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No parameters were updated. Current configuration:
- Default slippage: ${mockParameters.defaultSlippageBps / 100}%
- Default SOL amount: ${mockParameters.defaultAmountSol} SOL
- Gas priority: ${mockParameters.gasPriority}
- Max retries: ${mockParameters.maxRetries}
- Active regions: ${mockParameters.regions.join(', ')}

  To update parameters, provide at least one of: defaultSlippageBps, defaultAmountSol, gasPriority.
  `
        }
      ]
    };
  }
  
  // Log the updated parameters
  console.log(`[MOCK] Updated parameters: ${JSON.stringify(mockParameters)}`);
  
  // Return success response with list of updates
  return {
    content: [
      {
        type: 'text',
        text: `✅ Parameters updated successfully:
${updates.map(update => `- ${update}`).join('\n')}

Updated configuration:
- Default slippage: ${mockParameters.defaultSlippageBps / 100}%
- Default SOL amount: ${mockParameters.defaultAmountSol} SOL
- Gas priority: ${mockParameters.gasPriority}
- Max retries: ${mockParameters.maxRetries}
- Active regions: ${mockParameters.regions.join(', ')}

The changes have been applied and will be used for all future token snipe operations.`
      }
    ]
  };
}
