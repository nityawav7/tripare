import { NativeConnection, Worker } from '@temporalio/worker';
import path from 'path';
import { config } from './config';
import * as activities from './temporal/activities';

export async function runWorker() {
  console.log(`[Temporal Worker] Connecting to ${config.temporal.address}...`);

  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  const workflowsPath = require.resolve(path.join(__dirname, 'temporal', 'workflows'));
  console.log(`[Temporal Worker] Loaded workflows from: ${workflowsPath}`);

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    workflowsPath,
    activities,
  });

  console.log(`[Temporal Worker] Started listening on task queue: ${config.temporal.taskQueue}`);
  await worker.run();
}

if (require.main === module) {
  runWorker().catch((err) => {
    console.error('[Temporal Worker] Fatal error:', err);
    process.exit(1);
  });
}
