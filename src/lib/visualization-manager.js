export class VisualizationManager {
    async updateSnipeStatus(results) {
        // Log results to stderr for visualization
        console.error('\n=== Snipe Status Update ===');
        for (const result of results) {
            console.error(`[${result.region}] ${result.status} - Token: ${result.tokenMint}, Slippage: ${result.slippageBps / 100}%`);
        }
        console.error('=========================\n');
    }
    async updateStatus(status) {
        // Log status to stderr for visualization
        console.error('\n=== System Status ===');
        console.error(`Last Token: ${status.lastTokenMint || 'None'}`);
        console.error(`Status: ${status.status}`);
        console.error('\nRegion Status:');
        for (const region of status.regions) {
            console.error(`[${region.region}] ${region.status} (${region.latency}ms)`);
        }
        if (status.activeTransactions.length > 0) {
            console.error('\nActive Transactions:');
            for (const tx of status.activeTransactions) {
                console.error(`[${tx.region}] ${tx.status} - Token: ${tx.tokenMint}, Slippage: ${tx.slippageBps / 100}%`);
            }
        }
        console.error('===================\n');
    }
}
