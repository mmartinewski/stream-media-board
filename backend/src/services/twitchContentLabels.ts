const MAX_CONTENT_LABELS_PER_REQUEST = 6;

export function buildContentClassificationLabelUpdates(
  currentEnabled: string[],
  desiredEnabled: string[],
  lockedEnabled: string[] = [],
): Array<{ id: string; is_enabled: boolean }> {
  const current = new Set(currentEnabled);
  const desired = new Set([...desiredEnabled, ...lockedEnabled]);
  const locked = new Set(lockedEnabled);
  const updates: Array<{ id: string; is_enabled: boolean }> = [];

  for (const id of desired) {
    if (!current.has(id)) {
      updates.push({ id, is_enabled: true });
    }
  }
  for (const id of current) {
    if (!desired.has(id) && !locked.has(id)) {
      updates.push({ id, is_enabled: false });
    }
  }

  return updates;
}

export function chunkContentClassificationLabelUpdates(
  updates: Array<{ id: string; is_enabled: boolean }>,
): Array<Array<{ id: string; is_enabled: boolean }>> {
  if (updates.length === 0) return [];
  const chunks: Array<Array<{ id: string; is_enabled: boolean }>> = [];
  for (let i = 0; i < updates.length; i += MAX_CONTENT_LABELS_PER_REQUEST) {
    chunks.push(updates.slice(i, i + MAX_CONTENT_LABELS_PER_REQUEST));
  }
  return chunks;
}
