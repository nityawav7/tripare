import { Connection, Client } from '@temporalio/client';
import { config } from '../config';

let temporalClient: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (!temporalClient) {
    console.log(`[Temporal Client] Connecting to Temporal server at ${config.temporal.address}...`);
    const connection = await Connection.connect({
      address: config.temporal.address,
    });

    temporalClient = new Client({
      connection,
      namespace: config.temporal.namespace,
    });
    console.log(`[Temporal Client] Connected successfully to namespace "${config.temporal.namespace}"`);
  }

  return temporalClient;
}

/**
 * Health check helper for Temporal
 */
export async function checkTemporalHealth(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const client = await getTemporalClient();
    // Test cluster/service availability by checking service health
    await client.workflowService.getSystemInfo({});
    const latencyMs = Date.now() - start;
    return { status: 'up', latencyMs };
  } catch (err: any) {
    return { status: 'down', error: err?.message || 'Temporal unreachable' };
  }
}
