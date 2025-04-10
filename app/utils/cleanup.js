import { readdir, stat, unlink } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Deletes files in the uploads directory that are older than the specified age
 * @param {number} maxAgeMs Maximum age of files in milliseconds (default: 1 hour)
 * @returns {Promise<{deleted: number, errors: number}>} Count of deleted files and errors
 */
export async function cleanupOldUploads(maxAgeMs = 60 * 60 * 1000) { // Default: 1 hour
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  
  // Check if uploads directory exists
  if (!existsSync(uploadsDir)) {
    console.log('Uploads directory does not exist, nothing to clean up');
    return { deleted: 0, errors: 0 };
  }
  
  try {
    const now = Date.now();
    const files = await readdir(uploadsDir);
    let deleted = 0;
    let errors = 0;
    
    // Skip .gitkeep file if it exists
    const filesToProcess = files.filter(file => file !== '.gitkeep');
    
    console.log(`Checking ${filesToProcess.length} files for cleanup...`);
    
    for (const file of filesToProcess) {
      const filePath = path.join(uploadsDir, file);
      
      try {
        const fileStat = await stat(filePath);
        const fileAge = now - fileStat.mtimeMs;
        
        // If file is older than maxAgeMs, delete it
        if (fileAge > maxAgeMs) {
          await unlink(filePath);
          deleted++;
          console.log(`Deleted old file: ${file} (age: ${Math.round(fileAge / 1000 / 60)} minutes)`);
        }
      } catch (err) {
        console.error(`Error processing file ${file}:`, err);
        errors++;
      }
    }
    
    console.log(`Cleanup complete. Deleted ${deleted} files, encountered ${errors} errors.`);
    return { deleted, errors };
  } catch (error) {
    console.error('Error cleaning up old uploads:', error);
    return { deleted: 0, errors: 1 };
  }
}