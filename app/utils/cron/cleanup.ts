import cron from 'node-cron';
import cronParser from 'cron-parser';
import { cleanupOldUploads } from '../cleanup';

const DEFAULT_SCHEDULE = '*/30 * * * *';

let task: any = null;

/**
 * Normalises the CLEANUP_CRON_SCHEDULE value.
 *
 * Trims whitespace and strips one pair of wrapping quotes: docker-compose keeps
 * quotes literally in list-style `environment:` entries, and node-cron throws
 * (RangeError: Invalid time value) on a quoted pattern. Empty or invalid values
 * fall back to the default schedule.
 */
export function resolveCleanupSchedule(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();

  if (!value) {
    return DEFAULT_SCHEDULE;
  }

  if (!cron.validate(value)) {
    console.error(`Invalid CLEANUP_CRON_SCHEDULE ${JSON.stringify(raw)}, falling back to "${DEFAULT_SCHEDULE}"`);
    return DEFAULT_SCHEDULE;
  }

  return value;
}

export function initCronJobs() {
  if (task) {
    console.log('Cleanup cron job already initialized.');
    return;
  }

  console.log('Initializing cleanup cron job...');
  // Use environment variable for schedule, default to every 30 minutes
  const schedule = resolveCleanupSchedule(process.env.CLEANUP_CRON_SCHEDULE);
  console.log(`Cron schedule configured as: ${schedule}`);

  try {
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
  } catch (error) {
    // Never let a scheduling problem stop the server from starting
    console.error('Failed to schedule cleanup cron job; automatic cleanup is disabled:', error);
    task = null;
  }
}
