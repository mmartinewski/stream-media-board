import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppPaths } from '../config/paths.js';
import type { MacroRow } from '../db/repositories/macros.js';
import { generateSquareThumbnail, parseCropMeta } from './thumbnail.js';
import {
  assertStoredPathUnderDir,
  resolveStoredMediaPath,
  toStoredMediaPath,
} from './storedMediaPaths.js';

export interface MacroThumbnailUpdateInput {
  thumbnailBuffer?: Buffer;
  originalFilename?: string;
  mimeType?: string;
  cropJson?: string;
  removeThumbnail?: boolean;
}

export interface MacroThumbnailPaths {
  thumbnail_original_path: string | null;
  thumbnail_cropped_path: string | null;
  thumbnail_crop_meta: string | null;
}

function cleanupQuiet(paths: string[]): void {
  for (const filePath of paths) {
    try {
      unlinkSync(filePath);
    } catch {
      /* noop */
    }
  }
}

function pickUploadExt(originalFilename: string, mimeType: string | undefined): string {
  const ext = extname(originalFilename || '').toLowerCase();
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') return ext;
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}

export function macroThumbnailUrls(
  macroId: number,
  row: Pick<MacroRow, 'thumbnail_original_path' | 'thumbnail_cropped_path'>,
): {
  thumbnail_original_url: string | null;
  thumbnail_cropped_url: string | null;
} {
  if (!row.thumbnail_cropped_path) {
    return { thumbnail_original_url: null, thumbnail_cropped_url: null };
  }
  return {
    thumbnail_original_url: row.thumbnail_original_path
      ? `/api/macro-thumbnails/${macroId}/original`
      : null,
    thumbnail_cropped_url: `/api/macro-thumbnails/${macroId}/cropped`,
  };
}

export function deleteMacroThumbnailFiles(
  paths: AppPaths,
  row: Pick<MacroRow, 'thumbnail_original_path' | 'thumbnail_cropped_path'>,
): void {
  for (const stored of [row.thumbnail_original_path, row.thumbnail_cropped_path]) {
    if (!stored) continue;
    const filePath = resolveStoredMediaPath(paths, stored);
    assertStoredPathUnderDir(paths, paths.mediaMacroThumbnails, stored);
    cleanupQuiet([filePath]);
  }
}

export async function applyMacroThumbnailUpdate(
  paths: AppPaths,
  macroId: number,
  current: MacroRow,
  input: MacroThumbnailUpdateInput,
): Promise<MacroThumbnailPaths> {
  if (input.removeThumbnail) {
    deleteMacroThumbnailFiles(paths, current);
    return {
      thumbnail_original_path: null,
      thumbnail_cropped_path: null,
      thumbnail_crop_meta: null,
    };
  }

  const currentOrig = current.thumbnail_original_path
    ? resolveStoredMediaPath(paths, current.thumbnail_original_path)
    : null;
  const currentCrop = current.thumbnail_cropped_path
    ? resolveStoredMediaPath(paths, current.thumbnail_cropped_path)
    : null;

  let newOrig = currentOrig;
  let newCrop = currentCrop;
  let cropMetaOut = current.thumbnail_crop_meta;

  const processId = randomUUID().replace(/-/g, '');

  if (input.thumbnailBuffer && input.thumbnailBuffer.length > 0) {
    const uploadExt = pickUploadExt(input.originalFilename ?? '', input.mimeType);
    const tmpOrig = join(paths.mediaMacroThumbnails, `tmp_macro_${processId}_orig${uploadExt}`);
    const tmpCrop = join(paths.mediaMacroThumbnails, `tmp_macro_${processId}_1x1.jpg`);
    writeFileSync(tmpOrig, input.thumbnailBuffer);
    try {
      const applied = await generateSquareThumbnail(
        tmpOrig,
        tmpCrop,
        parseCropMeta(input.cropJson),
      );
      cropMetaOut = JSON.stringify(applied);
    } catch (err) {
      cleanupQuiet([tmpOrig, tmpCrop]);
      throw err;
    }
    newOrig = join(paths.mediaMacroThumbnails, `${macroId}_original${uploadExt}`);
    newCrop = join(paths.mediaMacroThumbnails, `${macroId}_1x1.jpg`);
    try {
      cleanupQuiet([newOrig, newCrop]);
      renameSync(tmpOrig, newOrig);
      renameSync(tmpCrop, newCrop);
    } catch (err) {
      cleanupQuiet([tmpOrig, tmpCrop]);
      throw err;
    }
    deleteMacroThumbnailFiles(paths, {
      thumbnail_original_path:
        current.thumbnail_original_path && currentOrig !== newOrig
          ? current.thumbnail_original_path
          : null,
      thumbnail_cropped_path:
        current.thumbnail_cropped_path && currentCrop !== newCrop
          ? current.thumbnail_cropped_path
          : null,
    });
  } else if (input.cropJson && currentOrig) {
    const parsed = parseCropMeta(input.cropJson);
    if (parsed) {
      assertStoredPathUnderDir(paths, paths.mediaMacroThumbnails, current.thumbnail_original_path);
      const tmpCrop = join(paths.mediaMacroThumbnails, `tmp_macro_${processId}_re.jpg`);
      const croppedTarget =
        currentCrop ?? join(paths.mediaMacroThumbnails, `${macroId}_1x1.jpg`);
      try {
        const applied = await generateSquareThumbnail(currentOrig, tmpCrop, parsed);
        cropMetaOut = JSON.stringify(applied);
        if (currentCrop) {
          cleanupQuiet([currentCrop]);
        }
        renameSync(tmpCrop, croppedTarget);
        newCrop = croppedTarget;
      } catch (err) {
        cleanupQuiet([tmpCrop]);
        throw err;
      }
    }
  }

  return {
    thumbnail_original_path: newOrig ? toStoredMediaPath(paths, newOrig) : null,
    thumbnail_cropped_path: newCrop ? toStoredMediaPath(paths, newCrop) : null,
    thumbnail_crop_meta: cropMetaOut,
  };
}
