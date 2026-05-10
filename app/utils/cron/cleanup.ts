import cron from 'node-cron';
import { cleanupOldUploads } from '../cleanup';

let task: any = null;

export function initCronJobs() {
  if (task) {
    console.log('Cleanup cron job already initialized.');
    return;
  }

  console.log('Initializing cleanup cron job...');
  // Use environment variable for schedule, default to every 30 minutes
  const schedule = process.env.CLEANUP_CRON_SCHEDULE || '*/30 * * * *';
  console.log(`Cron schedule configured as: ${schedule}`);

  task = cron.schedule(schedule, async () => {
    console.log(`Running cleanup at ${new Date().toISOString()}`);
    try {
      // 1 hour default
      const maxAgeMs = 60 * 60 * 1000;
      const result = await cleanupOldUploads(maxAgeMs);
      console.log(`Cleanup complete. Deleted ${result.deleted} files, encountered ${result.errors} errors.`);
    } catch (error) {
      console.error('Error in cleanup cron job:', error);
    }
  });
}
