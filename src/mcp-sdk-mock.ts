// Mock implementation of the MCP SDK
import * as readline from 'readline';

export class Server {
  private name: string;
  private version: string;
  private capabilities: any;
  public onerror: (error: any) => void;
  private handlers: Map<string, any> = new Map();
  private transport: any;
  private rl: readline.Interface | null = null;

  constructor(info: { name: string; version: string }, options: { capabilities: any }) {
    this.name = info.name;
    this.version = info.version;
    this.capabilities = options.capabilities;
    this.onerror = (error) => console.error('[MCP Error]', error);
  }

  setRequestHandler(schema: any, handler: any) {
    this.handlers.set(schema.method, handler);
  }

  async connect(transport: any) {
    this.transport = transport;
    
    // Redirect all console.log to console.error
    const originalConsoleLog = console.log;
    console.log = function(...args: any[]) {
      console.error(...args);
    };
    
    // Set up readline interface for stdin/stdout
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    // Handle incoming messages
    this.rl.on('line', async (line) => {
      try {
        const message = JSON.parse(line);
        
        // Handle initialize message
        if (message.method === 'initialize') {
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              serverInfo: {
                name: this.name,
                version: this.version
              },
              capabilities: this.capabilities
            }
          };
          
          process.stdout.write(JSON.stringify(response) + '\n');
          // Don't return, continue listening for more messages
        }
        
        // Handle other messages
        const handler = this.handlers.get(message.method);
        if (handler) {
          try {
            const result = await handler(message);
            const response = {
              jsonrpc: '2.0',
              id: message.id,
              result
            };
            
            process.stdout.write(JSON.stringify(response) + '\n');
          } catch (error: any) {
            const errorResponse = {
              jsonrpc: '2.0',
              id: message.id,
              error: {
                code: error.code || ErrorCode.InternalError,
                message: error.message || 'Internal error'
              }
            };
            
            process.stdout.write(JSON.stringify(errorResponse) + '\n');
          }
        } else {
          const errorResponse = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: ErrorCode.MethodNotFound,
              message: `Method not found: ${message.method}`
            }
          };
          
          process.stdout.write(JSON.stringify(errorResponse) + '\n');
        }
      } catch (error: any) {
        this.onerror(error);
      }
    });
    
    // Silent connection
  }

  async close() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    // Silent close
  }
}

export class StdioServerTransport {
  constructor() {}
}

export const CallToolRequestSchema = {
  method: 'callTool',
};

export const ListToolsRequestSchema = {
  method: 'listTools',
};

export enum ErrorCode {
  MethodNotFound = 'METHOD_NOT_FOUND',
  InvalidRequest = 'INVALID_REQUEST',
  InternalError = 'INTERNAL_ERROR',
  InvalidParams = 'INVALID_PARAMS',
}

export class McpError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'McpError';
  }
}
