import axios from 'axios';
import dotenv from 'dotenv';
import { SnipeStatus } from './visualization-manager.js';

dotenv.config();

interface CloudFunctionResponse {
  success: boolean;
  region: string;
  result?: any;
  error?: string;
  performance?: any;
}

export class CloudManager {
  private readonly functionEndpoints: Record<string, string>;
  private readonly functionApiKey?: string;

  constructor() {
    // Load function endpoints from environment variables
    this.functionEndpoints = {
      'us-central1': process.env.US_FUNCTION_URL || '',
      'asia-east1': process.env.ASIA_FUNCTION_URL || '',
      'europe-west1': process.env.EUROPE_FUNCTION_URL || ''
    };
    
    this.functionApiKey = process.env.FUNCTION_API_KEY;
    
    // Validate at least one endpoint is configured
    const availableRegions = this.getAvailableRegions();
    if (availableRegions.length === 0) {
      console.error('[Cloud] Warning: No cloud function endpoints configured in .env');
    } else {
      console.error(`[Cloud] Found ${availableRegions.length} function endpoints: ${availableRegions.join(', ')}`);
    }
  }

  getAvailableRegions(): string[] {
    // Debug output to see what's in functionEndpoints
    Object.entries(this.functionEndpoints).forEach(([region, url]) => {
      console.error(`[Cloud Debug] Region ${region} URL: "${url}", starts with http: ${url?.startsWith('http')}}`);
    });
    
    // Return valid regions
    return Object.keys(this.functionEndpoints).filter(region => {
      const url = this.functionEndpoints[region];
      return url && typeof url === 'string' && url.startsWith('http');
    });
  }

  async snipeTokenInAllRegions(
    tokenMint: string, 
    slippageBps: number, 
    amountSol: number = 0.05,
    regions?: string[]
  ): Promise<SnipeStatus[]> {
    // Select regions to call
    const targetRegions = regions || this.getAvailableRegions();
    
    if (targetRegions.length === 0) {
      console.error('[Cloud] No regions available to call!');
      throw new Error('No cloud function regions configured. Check your .env file. URLs must start with http:// or https://');
    }
    
    console.error(`[Cloud] Calling ${targetRegions.length} cloud functions in parallel: ${targetRegions.join(', ')}`);
    
    // Record start time for performance measurement
    const startTime = Date.now();
    
    // Create snipe requests for each region
    const requests = targetRegions.map(region => {
      const endpoint = this.functionEndpoints[region];
      
      if (!endpoint) {
        console.error(`[Cloud] Missing endpoint URL for region ${region}`);
        return Promise.resolve({
          success: false,
          region,
          error: `No endpoint URL configured for region ${region}`
        });
      }
      
      console.error(`[Cloud] Sending request to ${region}: ${endpoint}`);
      
      // Call cloud function with auth header if API key is set
      return axios.post(endpoint, {
        tokenMint,
        slippageBps,
        amountSol
      }, {
        headers: this.functionApiKey ? {
          'Authorization': `Bearer ${this.functionApiKey}`
        } : undefined,
        timeout: 30000 // 30 second timeout
      })
      .then(response => {
        console.error(`[Cloud] Received response from ${region}`);
        return response.data;
      })
      .catch(error => {
        console.error(`[Cloud] Error from ${region}:`, error.message);
        return {
          success: false,
          region,
          error: error.response?.data?.error || error.message
        };
      });
    });
    
    // Wait for all requests to complete (with a 30s timeout)
    let results: CloudFunctionResponse[];
    try {
      results = await Promise.all(requests);
    } catch (error) {
      console.error('[Cloud] Error executing cloud functions:', error);
      throw error;
    }
    
    // Record total execution time
    const totalTime = Date.now() - startTime;
    console.error(`[Cloud] All cloud functions completed in ${totalTime}ms`);
    
    // Convert to SnipeStatus format
    return results.map(result => {
      if (!result.success) {
        // Error case
        return {
          region: result.region,
          status: 'error',
          tokenMint,
          slippageBps,
          timestamp: new Date().toISOString(),
          error: result.error || 'Unknown error',
          timing: {
            poolFindTime: result.performance?.poolFindTime || 0,
            txSubmitTime: result.performance?.txSubmitTime || 0,
            txConfirmTime: result.performance?.txConfirmTime || 0,
            totalTime: result.performance?.executionTime || totalTime
          }
        };
      } else {
        // Success case
        return {
          region: result.region,
          status: 'success',
          tokenMint,
          slippageBps,
          timestamp: new Date().toISOString(),
          pools: result.result?.pools || { amm: 0, serum: 0 },
          txId: result.result?.txId || '',
          timing: {
            poolFindTime: result.performance?.poolFindTime || 0,
            txSubmitTime: result.performance?.txSubmitTime || 0,
            txConfirmTime: result.performance?.txConfirmTime || 0,
            totalTime: result.performance?.executionTime || totalTime
          }
        };
      }
    });
  }
}
