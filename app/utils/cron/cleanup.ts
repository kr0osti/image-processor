import cron from 'node-cron';
import cronParser from 'cron-parser';
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
      // Calculate max age based on the cron schedule interval
      let maxAgeMs = 60 * 60 * 1000; // 1 hour default

      try {
        const interval = cronParser.parse(schedule);
        const next = interval.next().getTime();
        const next2 = interval.next().getTime();
        maxAgeMs = next2 - next;
      } catch (err) {
        console.error('Error parsing cron schedule, falling back to 1 hour max age:', err);
      }

      const result = await cleanupOldUploads(maxAgeMs);
      console.log(`Cleanup complete. Deleted ${result.deleted} files (older than ${maxAgeMs}ms), encountered ${result.errors} errors.`);
    } catch (error) {
      console.error('Error in cleanup cron job:', error);
    }
  });
}
