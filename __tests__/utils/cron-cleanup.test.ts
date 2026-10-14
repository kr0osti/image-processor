/**
 * @jest-environment node
 */

jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(),
}));

describe('resolveCleanupSchedule', () => {
  let resolveCleanupSchedule: (raw: string | undefined) => string;

  beforeAll(() => {
    ({ resolveCleanupSchedule } = jest.requireActual('../../app/utils/cron/cleanup'));
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a valid schedule unchanged', () => {
    expect(resolveCleanupSchedule('*/15 * * * *')).toBe('*/15 * * * *');
  });

  it('strips wrapping double quotes (docker-compose list-style environment)', () => {
    expect(resolveCleanupSchedule('"*/30 * * * *"')).toBe('*/30 * * * *');
  });

  it('strips wrapping single quotes and surrounding whitespace', () => {
    expect(resolveCleanupSchedule("  '0 * * * *'  ")).toBe('0 * * * *');
  });

  it('falls back to the default when unset or empty', () => {
    expect(resolveCleanupSchedule(undefined)).toBe('*/30 * * * *');
    expect(resolveCleanupSchedule('')).toBe('*/30 * * * *');
    expect(resolveCleanupSchedule('""')).toBe('*/30 * * * *');
  });

  it('falls back to the default and logs an error for invalid schedules', () => {
    expect(resolveCleanupSchedule('not a cron')).toBe('*/30 * * * *');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid CLEANUP_CRON_SCHEDULE'));
  });
});

describe('initCronJobs', () => {
  const originalSchedule = process.env.CLEANUP_CRON_SCHEDULE;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('node-cron');
    if (originalSchedule === undefined) {
      delete process.env.CLEANUP_CRON_SCHEDULE;
    } else {
      process.env.CLEANUP_CRON_SCHEDULE = originalSchedule;
    }
  });

  it('schedules the unquoted pattern when the env value is quoted', () => {
    const schedule = jest.fn(() => ({ stop: jest.fn() }));
    jest.doMock('node-cron', () => ({ __esModule: true, default: { validate: () => true, schedule } }));
    process.env.CLEANUP_CRON_SCHEDULE = '"*/30 * * * *"';

    const { initCronJobs } = require('../../app/utils/cron/cleanup');
    initCronJobs();

    expect(schedule).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function));
  });

  it('does not throw when scheduling fails', () => {
    const schedule = jest.fn(() => {
      throw new RangeError('Invalid time value');
    });
    jest.doMock('node-cron', () => ({ __esModule: true, default: { validate: () => true, schedule } }));
    process.env.CLEANUP_CRON_SCHEDULE = '*/30 * * * *';

    const { initCronJobs } = require('../../app/utils/cron/cleanup');

    expect(() => initCronJobs()).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to schedule cleanup cron job'),
      expect.any(RangeError)
    );
  });
});
