import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VideoDimensions {
  width: number;
  height: number;
}

export async function probeVideoDimensions(
  ffprobeExe: string,
  filePath: string,
): Promise<VideoDimensions> {
  const { stdout } = await execFileAsync(ffprobeExe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    filePath,
  ]);
  const line = stdout.trim().split('\n')[0] ?? '';
  const [widthRaw, heightRaw] = line.split('x');
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`ffprobe returned invalid dimensions: "${stdout}"`);
  }
  return { width, height };
}

export async function probeDurationSeconds(
  ffprobeExe: string,
  filePath: string,
): Promise<number> {
  const { stdout } = await execFileAsync(ffprobeExe, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const value = Number(stdout.trim());
  if (!Number.isFinite(value)) {
    throw new Error(`ffprobe returned an invalid duration: "${stdout}"`);
  }
  return value;
}
