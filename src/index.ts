#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Keypair } from '@solana/web3.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { RegionManager } from './lib/region-manager.js';
import { TokenParser } from './lib/token-parser.js';
import { SnipeTokenTool } from './tools/snipe-token.js';
import { ConfigureParametersTool } from './tools/configure-parameters.js';
import { StatusTool } from './tools/status.js';
import { VisualizationManager } from './lib/visualization-manager.js';
import bs58 from 'bs58';
import { setGlobalDispatcher, Agent } from 'undici';

// Configure undici
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }));

// Import tool argument types
interface SnipeTokenArgs {
  token: string;
  slippage?: number;
  regions?: string[];
}

interface ConfigureParametersArgs {
  slippage?: number;
  minProfit?: number;
  maxGas?: number;
  timeout?: number;
}

interface StatusArgs {}

// Get the directory of the current module (works correctly after compilation to build/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct the absolute path to the .env file in the project root (one level up from build/)
const envPath = path.resolve(__dirname, '../.env');

// Load environment variables from the specified path
dotenv.config({ path: envPath });
console.error(`[Startup] Loading .env from: ${envPath}`); // Added for debugging

// Redirect all console.log to stderr to avoid interfering with JSON-RPC communication
const originalConsoleLog = console.log;
console.log = function(...args) {
  console.error(...args);
};

// Initialize wallet
let wallet: Keypair;
try {
  if (process.env.WALLET_PRIVATE_KEY) {
    const privateKeyBytes = bs58.decode(process.env.WALLET_PRIVATE_KEY);
    const uint8Array = new Uint8Array(privateKeyBytes);
    wallet = Keypair.fromSecretKey(uint8Array);
    console.error(`Wallet initialized: ${wallet.publicKey.toBase58()}`);
  } else {
    wallet = Keypair.generate();
    console.error(`Generated new wallet: ${wallet.publicKey.toBase58()}`);
  }
} catch (error) {
  console.error('Error initializing wallet:', error);
  wallet = Keypair.generate();
  console.error(`Falling back to generated wallet: ${wallet.publicKey.toBase58()}`);
}

// Initialize state
const state = {
  regions: process.env.REGIONS?.split(',') || ['US', 'Asia', 'Europe'],
  slippageBps: parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '100'),
  minProfitSol: parseFloat(process.env.DEFAULT_MIN_PROFIT_SOL || '0.1'),
  maxGasSol: parseFloat(process.env.DEFAULT_MAX_GAS_SOL || '0.005'),
  timeoutMs: parseInt(process.env.DEFAULT_TIMEOUT_MS || '200'),
  activeTransactions: new Map(),
  lastTokenMint: null,
  lastStatus: 'idle',
  wallet
};

// Initialize managers
const regionManager = new RegionManager(state);
const tokenParser = new TokenParser();
const visualizationManager = new VisualizationManager();

// Initialize tools
const snipeTokenTool = new SnipeTokenTool(state, regionManager, tokenParser, visualizationManager);
const configureParametersTool = new ConfigureParametersTool(state);
const statusTool = new StatusTool(state, regionManager, visualizationManager);

class SniperMcpServer {
  private server: Server;
  private isShuttingDown = false;

  constructor() {
    // Define tools in server capabilities
    const tools = {
      snipe_token: {
        name: 'snipe_token',
        description: 'Snipe a token across multiple regions with specified parameters',
        inputSchema: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Token to snipe (can be address or natural language like "snipe XYZ with 2% slippage")'
            },
            slippage: {
              type: 'number',
              description: 'Slippage tolerance in percentage (optional)'
            },
            regions: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Regions to snipe in (optional, defaults to all configured regions)'
            }
          },
          required: ['token']
        }
      },
      configure: {
        name: 'configure',
        description: 'Configure sniper parameters',
        inputSchema: {
          type: 'object',
          properties: {
            slippage: {
              type: 'number',
              description: 'Slippage tolerance in percentage'
            },
            minProfit: {
              type: 'number',
              description: 'Minimum profit threshold in SOL'
            },
            maxGas: {
              type: 'number',
              description: 'Maximum gas fee in SOL'
            },
            timeout: {
              type: 'number',
              description: 'Transaction timeout in milliseconds'
            }
          }
        }
      },
      status: {
        name: 'status',
        description: 'Get current status of the sniper bot',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    };

    this.server = new Server(
      {
        name: '100ms-sniper-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    // Handle MCP server errors
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    // Handle process signals
    process.on('SIGINT', async () => {
      await this.shutdown('SIGINT');
    });

    process.on('SIGTERM', async () => {
      await this.shutdown('SIGTERM');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('[Uncaught Exception]', error);
      await this.shutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', async (reason) => {
      console.error('[Unhandled Rejection]', reason);
      await this.shutdown('UNHANDLED_REJECTION');
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'snipe_token',
          description: 'Snipe a token across multiple regions with specified parameters',
          inputSchema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'Token to snipe (can be address or natural language like "snipe XYZ with 2% slippage")'
              },
              slippage: {
                type: 'number',
                description: 'Slippage tolerance in percentage (optional)'
              },
              regions: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Regions to snipe in (optional, defaults to all configured regions)'
              }
            },
            required: ['token']
          }
        },
        {
          name: 'configure',
          description: 'Configure sniper parameters',
          inputSchema: {
            type: 'object',
            properties: {
              slippage: {
                type: 'number',
                description: 'Slippage tolerance in percentage'
              },
              minProfit: {
                type: 'number',
                description: 'Minimum profit threshold in SOL'
              },
              maxGas: {
                type: 'number',
                description: 'Maximum gas fee in SOL'
              },
              timeout: {
                type: 'number',
                description: 'Transaction timeout in milliseconds'
              }
            }
          }
        },
        {
          name: 'status',
          description: 'Get current status of the sniper bot',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = request.params.arguments || {};

      switch (request.params.name) {
        case 'snipe_token': {
          if (!('token' in args)) {
            throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: token');
          }
          const snipeArgs: SnipeTokenArgs = {
            token: String(args.token),
            slippage: typeof args.slippage === 'number' ? args.slippage : undefined,
            regions: Array.isArray(args.regions) ? args.regions.map(String) : undefined
          };
          return await snipeTokenTool.execute(snipeArgs);
        }
        case 'configure': {
          const configArgs: ConfigureParametersArgs = {
            slippage: typeof args.slippage === 'number' ? args.slippage : undefined,
            minProfit: typeof args.minProfit === 'number' ? args.minProfit : undefined,
            maxGas: typeof args.maxGas === 'number' ? args.maxGas : undefined,
            timeout: typeof args.timeout === 'number' ? args.timeout : undefined
          };
          return await configureParametersTool.execute(configArgs);
        }
        case 'status':
          return await statusTool.execute({});
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async shutdown(reason: string) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.error(`[Shutdown] Initiating shutdown due to ${reason}...`);
    
    try {
      // Close all connections
      console.error('[Shutdown] Closing region connections...');
      await regionManager.closeAllConnections();

      // Close MCP server
      console.error('[Shutdown] Closing MCP server...');
      await this.server.close();

      console.error('[Shutdown] Shutdown complete');
    } catch (error) {
      console.error('[Shutdown] Error during shutdown:', error);
    }

    // Exit with non-zero code for abnormal termination
    const exitCode = reason === 'SIGINT' || reason === 'SIGTERM' ? 0 : 1;
    process.exit(exitCode);
  }

  async run() {
    try {
      console.error('[Startup] Initializing region connections...');
      await regionManager.initializeConnections();
      
      console.error('[Startup] Connecting to MCP transport...');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.error('[Startup] 100ms Sniper MCP server is running');
    } catch (error) {
      console.error('[Startup] Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new SniperMcpServer();
server.run().catch(console.error);
