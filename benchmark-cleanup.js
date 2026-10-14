import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { cleanupOldUploads } from './app/utils/cleanup.js';

const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

async function createDummyFiles(count) {
  if (!existsSync(uploadsDir)) {
    await fs.mkdir(uploadsDir, { recursive: true });
  }

  const batchSize = 100;
  for (let i = 0; i < count; i += batchSize) {
    const promises = [];
    const end = Math.min(i + batchSize, count);
    for (let j = i; j < end; j++) {
      const filePath = path.join(uploadsDir, `dummy-${j}.txt`);
      promises.push(fs.writeFile(filePath, 'dummy content'));
    }
    await Promise.all(promises);
  }
}

async function runBenchmark() {
  console.log('Preparing benchmark...');
  const fileCount = 5000;

  // Clean up any existing files first
  if (existsSync(uploadsDir)) {
    const files = await fs.readdir(uploadsDir);
    for (const file of files) {
      if (file !== '.gitkeep') {
        await fs.unlink(path.join(uploadsDir, file)).catch(() => {});
      }
    }
  }

  await createDummyFiles(fileCount);
  console.log(`Created ${fileCount} dummy files.`);

  // Set file modified time to be older than 1 hour to trigger deletion
  const oneHourAndOneMinuteAgo = new Date(Date.now() - (60 * 60 * 1000 + 60000));

  const files = await fs.readdir(uploadsDir);
  for (let i = 0; i < files.length; i += 100) {
     const promises = [];
     const end = Math.min(i + 100, files.length);
     for (let j = i; j < end; j++) {
        if (files[j] !== '.gitkeep') {
            promises.push(fs.utimes(path.join(uploadsDir, files[j]), oneHourAndOneMinuteAgo, oneHourAndOneMinuteAgo));
        }
     }
     await Promise.all(promises);
  }
  console.log('Set file timestamps to be eligible for deletion.');


  console.log('\nRunning cleanup...');
  const start = performance.now();

  const result = await cleanupOldUploads();

  const end = performance.now();
  const timeMs = end - start;

  console.log(`Cleanup completed in ${timeMs.toFixed(2)} ms`);
  console.log(`Result:`, result);
  console.log(`Throughput: ${(fileCount / (timeMs / 1000)).toFixed(2)} files/sec`);

  // Clean up directory if it's empty
  try {
     const remaining = await fs.readdir(uploadsDir);
     if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === '.gitkeep')) {
        console.log('Benchmark directory is clean.');
     }
  } catch (err) {
      // ignore
  }
}

runBenchmark().catch(console.error);
