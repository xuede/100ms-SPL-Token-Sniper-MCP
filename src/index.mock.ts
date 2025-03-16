#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import 'dotenv/config';

// Import mock tools
import { mockSnipeToken } from './mock-tools/snipe-token-mock.js';
import { mockStatus } from './mock-tools/status-mock.js';
import { mockConfigureParameters } from './mock-tools/configure-parameters-mock.js';

// Banner text for logging
const BANNER = `
╔═══════════════════════════════════════════════════════════════════════╗
║                 100ms RAYDIUM SNIPER - MOCK SERVER MODE               ║
║                                                                       ║
║  This is running in DEMO MODE with simulated responses. No actual     ║
║  blockchain transactions are being executed. Perfect for demos!       ║
╚═══════════════════════════════════════════════════════════════════════╝
`;

/**
 * Mock implementation of the 100ms Raydium Sniper MCP server for demo purposes.
 * This provides fast, predictable responses without requiring real API keys,
 * wallet funds, or blockchain transactions. Ideal for demos and videos.
 */
class MockRaydiumSniperServer {
  private server: Server;

  constructor() {
    console.log(BANNER);
    
    // Initialize the MCP server
    this.server = new Server(
      {
        name: '100ms-raydium-sniper-mock',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up tool handlers
    this.setupToolHandlers();
    
    // Set up error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    
    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('[Shutdown] Initiating shutdown due to SIGINT...');
      await this.shutdown();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'snipe_token',
          description: 'Snipe a token on Raydium by providing the token mint address',
          inputSchema: {
            type: 'object',
            properties: {
              tokenMint: {
                type: 'string',
                description: 'The mint address of the token to snipe',
              },
              amountSol: {
                type: 'number',
                description: 'Amount of SOL to spend on the token (default: 0.05)',
              },
              slippageBps: {
                type: 'number',
                description: 'Slippage percentage in basis points (1% = 100, default: 100)',
              },
            },
            required: ['tokenMint'],
          },
        },
        {
          name: 'status',
          description: 'Check the status of the 100ms Raydium Sniper',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'configure_parameters',
          description: 'Configure default parameters for sniping',
          inputSchema: {
            type: 'object',
            properties: {
              defaultSlippageBps: {
                type: 'number',
                description: 'Default slippage percentage in basis points (1% = 100)',
              },
              defaultAmountSol: {
                type: 'number',
                description: 'Default amount of SOL to spend on tokens',
              },
              gasPriority: {
                type: 'string',
                description: 'Gas priority level (Low, Medium, High, Extreme)',
              },
            },
          },
        },
      ],
    }));

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log(`[MOCK] Tool execution request received: ${request.params.name}`);
      
      switch (request.params.name) {
        case 'snipe_token':
          return this.handleSnipeToken(request.params.arguments);
        
        case 'status':
          return this.handleStatus();
        
        case 'configure_parameters':
          return this.handleConfigureParameters(request.params.arguments);
        
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleSnipeToken(args: any) {
    console.log(`[MOCK] Snipe token request received:`, args);
    
    // Validate arguments
    if (!args.tokenMint) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'tokenMint parameter is required'
      );
    }
    
    // Use default values if not provided
    const amountSol = args.amountSol || 0.05;
    const slippageBps = args.slippageBps || 100;
    
    // Call the mock implementation and convert to the format expected by the SDK
    const response = await mockSnipeToken({
      tokenMint: args.tokenMint,
      amountSol,
      slippageBps,
    });
    
    // Format for MCP SDK expectations
    return {
      content: response.content
    };
  }

  private async handleStatus() {
    console.log(`[MOCK] Status request received`);
    
    // Call the mock implementation and convert to the format expected by the SDK
    const response = await mockStatus();
    
    // Format for MCP SDK expectations
    return {
      content: response.content
    };
  }

  private async handleConfigureParameters(args: any) {
    console.log(`[MOCK] Configure parameters request received:`, args);
    
    // Call the mock implementation and convert to the format expected by the SDK
    const response = await mockConfigureParameters(args);
    
    // Format for MCP SDK expectations
    return {
      content: response.content,
      isError: response.isError
    };
  }

  async run() {
    // Create a transport for communicating with the LLM
    const transport = new StdioServerTransport();
    
    // Connect and initialize
    await this.server.connect(transport);
    
    console.log('[Startup] 100ms Sniper MCP server (MOCK MODE) is running');
    console.log('[Startup] This server is running in DEMO MODE - no real transactions will be executed');
  }

  async shutdown() {
    console.log('[Shutdown] Closing MCP server...');
    await this.server.close();
    console.log('[Shutdown] Shutdown complete');
  }
}

// Start the server
const server = new MockRaydiumSniperServer();
server.run().catch(console.error);
