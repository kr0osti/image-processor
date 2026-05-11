export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initCronJobs } = await import('./app/utils/cron/cleanup');
    initCronJobs();
  }
}
