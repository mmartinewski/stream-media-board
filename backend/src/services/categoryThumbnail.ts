import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppPaths } from '../config/paths.js';
import type { CategoryRow } from '../db/repositories/categories.js';
import { HttpError } from '../middleware/errorHandler.js';
import { generateSquareThumbnail, parseCropMeta } from './thumbnail.js';

export interface CategoryThumbnailUpdateInput {
  thumbnailBuffer?: Buffer;
  originalFilename?: string;
  mimeType?: string;
  cropJson?: string;
  removeThumbnail?: boolean;
}

export interface CategoryThumbnailPaths {
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

function assertPathUnderDir(dir: string, filePath: string): void {
  const base = resolve(dir) + sep;
  const target = resolve(filePath);
  if (!target.toLowerCase().startsWith(base.toLowerCase())) {
    throw new HttpError(500, 'Path is outside the allowed directory.', 'path_safety');
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

export function categoryThumbnailUrls(
  categoryId: number,
  row: Pick<CategoryRow, 'thumbnail_original_path' | 'thumbnail_cropped_path'>,
): {
  thumbnail_original_url: string | null;
  thumbnail_cropped_url: string | null;
} {
  if (!row.thumbnail_cropped_path) {
    return { thumbnail_original_url: null, thumbnail_cropped_url: null };
  }
  return {
    thumbnail_original_url: row.thumbnail_original_path
      ? `/api/category-thumbnails/${categoryId}/original`
      : null,
    thumbnail_cropped_url: `/api/category-thumbnails/${categoryId}/cropped`,
  };
}

export function deleteCategoryThumbnailFiles(
  paths: AppPaths,
  row: Pick<CategoryRow, 'thumbnail_original_path' | 'thumbnail_cropped_path'>,
): void {
  for (const filePath of [row.thumbnail_original_path, row.thumbnail_cropped_path]) {
    if (!filePath) continue;
    assertPathUnderDir(paths.mediaCategoryThumbnails, filePath);
    cleanupQuiet([filePath]);
  }
}

export async function applyCategoryThumbnailUpdate(
  paths: AppPaths,
  categoryId: number,
  current: CategoryRow,
  input: CategoryThumbnailUpdateInput,
): Promise<CategoryThumbnailPaths> {
  if (input.removeThumbnail) {
    deleteCategoryThumbnailFiles(paths, current);
    return {
      thumbnail_original_path: null,
      thumbnail_cropped_path: null,
      thumbnail_crop_meta: null,
    };
  }

  let newOrig = current.thumbnail_original_path;
  let newCrop = current.thumbnail_cropped_path;
  let cropMetaOut = current.thumbnail_crop_meta;

  const processId = randomUUID().replace(/-/g, '');

  if (input.thumbnailBuffer && input.thumbnailBuffer.length > 0) {
    const uploadExt = pickUploadExt(input.originalFilename ?? '', input.mimeType);
    const tmpOrig = join(paths.mediaCategoryThumbnails, `tmp_cat_${processId}_orig${uploadExt}`);
    const tmpCrop = join(paths.mediaCategoryThumbnails, `tmp_cat_${processId}_1x1.jpg`);
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
    newOrig = join(paths.mediaCategoryThumbnails, `${categoryId}_original${uploadExt}`);
    newCrop = join(paths.mediaCategoryThumbnails, `${categoryId}_1x1.jpg`);
    try {
      cleanupQuiet([newOrig, newCrop]);
      renameSync(tmpOrig, newOrig);
      renameSync(tmpCrop, newCrop);
    } catch (err) {
      cleanupQuiet([tmpOrig, tmpCrop]);
      throw err;
    }
    deleteCategoryThumbnailFiles(paths, {
      thumbnail_original_path:
        current.thumbnail_original_path && current.thumbnail_original_path !== newOrig
          ? current.thumbnail_original_path
          : null,
      thumbnail_cropped_path:
        current.thumbnail_cropped_path && current.thumbnail_cropped_path !== newCrop
          ? current.thumbnail_cropped_path
          : null,
    });
  } else if (input.cropJson && current.thumbnail_original_path) {
    const parsed = parseCropMeta(input.cropJson);
    if (parsed) {
      assertPathUnderDir(paths.mediaCategoryThumbnails, current.thumbnail_original_path);
      const tmpCrop = join(paths.mediaCategoryThumbnails, `tmp_cat_${processId}_re.jpg`);
      const croppedTarget =
        current.thumbnail_cropped_path ??
        join(paths.mediaCategoryThumbnails, `${categoryId}_1x1.jpg`);
      try {
        const applied = await generateSquareThumbnail(
          current.thumbnail_original_path,
          tmpCrop,
          parsed,
        );
        cropMetaOut = JSON.stringify(applied);
        if (current.thumbnail_cropped_path) {
          cleanupQuiet([current.thumbnail_cropped_path]);
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
    thumbnail_original_path: newOrig,
    thumbnail_cropped_path: newCrop,
    thumbnail_crop_meta: cropMetaOut,
  };
}
