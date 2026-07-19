import type { Database as BetterDatabase } from 'better-sqlite3';

export type ControlWidgetType = 'macro' | 'clip' | 'markdown' | 'gif';

export interface ControlDashboardRow {
  id: number;
  name: string;
  columns: number;
  created_at: string;
  updated_at: string;
}

export interface ControlDashboardWidgetRow {
  id: number;
  dashboard_id: number;
  widget_type: ControlWidgetType;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  macro_id: number | null;
  clip_id: number | null;
  gif_provider: string | null;
  gif_external_id: string | null;
  markdown_body: string | null;
  created_at: string;
}

export interface ControlWidgetInput {
  widget_type: ControlWidgetType;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  macro_id?: number | null;
  clip_id?: number | null;
  gif_provider?: string | null;
  gif_external_id?: string | null;
  markdown_body?: string | null;
}

const WIDGET_COLUMNS =
  'id, dashboard_id, widget_type, grid_x, grid_y, grid_w, grid_h, macro_id, clip_id, gif_provider, gif_external_id, markdown_body, created_at';

export function ensureControlDashboardSchema(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_dashboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Painel',
      columns INTEGER NOT NULL DEFAULT 12,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS control_dashboard_widgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dashboard_id INTEGER NOT NULL,
      widget_type TEXT NOT NULL CHECK (widget_type IN ('macro', 'clip', 'markdown', 'gif')),
      grid_x INTEGER NOT NULL DEFAULT 0,
      grid_y INTEGER NOT NULL DEFAULT 0,
      grid_w INTEGER NOT NULL DEFAULT 2,
      grid_h INTEGER NOT NULL DEFAULT 2,
      macro_id INTEGER,
      clip_id INTEGER,
      gif_provider TEXT,
      gif_external_id TEXT,
      markdown_body TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dashboard_id) REFERENCES control_dashboards(id) ON DELETE CASCADE,
      FOREIGN KEY (macro_id) REFERENCES macros(id) ON DELETE SET NULL,
      FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE SET NULL
    );
  `);

  migrateControlDashboardWidgetsForGif(db);

  const existing = db
    .prepare('SELECT id FROM control_dashboards ORDER BY id ASC LIMIT 1')
    .get() as { id: number } | undefined;
  if (!existing) {
    db.prepare(`INSERT INTO control_dashboards(name, columns) VALUES ('Painel', 12)`).run();
  }
}

function migrateControlDashboardWidgetsForGif(db: BetterDatabase): void {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'control_dashboard_widgets'`)
    .get() as { name: string } | undefined;
  if (!table) return;

  const cols = db.prepare('PRAGMA table_info(control_dashboard_widgets)').all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === 'gif_provider')) return;

  db.exec(`
    CREATE TABLE control_dashboard_widgets_gif_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dashboard_id INTEGER NOT NULL,
      widget_type TEXT NOT NULL CHECK (widget_type IN ('macro', 'clip', 'markdown', 'gif')),
      grid_x INTEGER NOT NULL DEFAULT 0,
      grid_y INTEGER NOT NULL DEFAULT 0,
      grid_w INTEGER NOT NULL DEFAULT 2,
      grid_h INTEGER NOT NULL DEFAULT 2,
      macro_id INTEGER,
      clip_id INTEGER,
      gif_provider TEXT,
      gif_external_id TEXT,
      markdown_body TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dashboard_id) REFERENCES control_dashboards(id) ON DELETE CASCADE,
      FOREIGN KEY (macro_id) REFERENCES macros(id) ON DELETE SET NULL,
      FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE SET NULL
    );

    INSERT INTO control_dashboard_widgets_gif_mig(
      id, dashboard_id, widget_type, grid_x, grid_y, grid_w, grid_h,
      macro_id, clip_id, gif_provider, gif_external_id, markdown_body, created_at
    )
    SELECT
      id, dashboard_id, widget_type, grid_x, grid_y, grid_w, grid_h,
      macro_id, clip_id, NULL, NULL, markdown_body, created_at
    FROM control_dashboard_widgets;

    DROP TABLE control_dashboard_widgets;
    ALTER TABLE control_dashboard_widgets_gif_mig RENAME TO control_dashboard_widgets;
  `);
}

export function getDefaultControlDashboard(db: BetterDatabase): ControlDashboardRow {
  ensureControlDashboardSchema(db);
  return db
    .prepare(
      `SELECT id, name, columns, created_at, updated_at
       FROM control_dashboards
       ORDER BY id ASC
       LIMIT 1`,
    )
    .get() as ControlDashboardRow;
}

export function listControlDashboards(db: BetterDatabase): ControlDashboardRow[] {
  ensureControlDashboardSchema(db);
  return db
    .prepare(
      `SELECT id, name, columns, created_at, updated_at
       FROM control_dashboards
       ORDER BY id ASC`,
    )
    .all() as ControlDashboardRow[];
}

export function getControlDashboardById(
  db: BetterDatabase,
  id: number,
): ControlDashboardRow | null {
  ensureControlDashboardSchema(db);
  return (
    (db
      .prepare(
        `SELECT id, name, columns, created_at, updated_at
         FROM control_dashboards
         WHERE id = ?`,
      )
      .get(id) as ControlDashboardRow | undefined) ?? null
  );
}

export function createControlDashboard(
  db: BetterDatabase,
  name: string,
  columns = 12,
): ControlDashboardRow {
  ensureControlDashboardSchema(db);
  const trimmed = name.trim() || 'Novo painel';
  const result = db
    .prepare(
      `INSERT INTO control_dashboards(name, columns) VALUES (?, ?)`,
    )
    .run(trimmed, columns);
  const row = getControlDashboardById(db, Number(result.lastInsertRowid));
  if (!row) throw new Error('Failed to create control dashboard.');
  return row;
}

export function updateControlDashboard(
  db: BetterDatabase,
  id: number,
  patch: { name?: string; columns?: number },
): ControlDashboardRow | null {
  ensureControlDashboardSchema(db);
  const existing = getControlDashboardById(db, id);
  if (!existing) return null;

  const name =
    patch.name != null ? patch.name.trim() || existing.name : existing.name;
  const columns =
    patch.columns != null && Number.isInteger(patch.columns) && patch.columns >= 1
      ? patch.columns
      : existing.columns;

  db.prepare(
    `UPDATE control_dashboards
     SET name = ?, columns = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(name, columns, id);

  return getControlDashboardById(db, id);
}

export function countControlDashboards(db: BetterDatabase): number {
  ensureControlDashboardSchema(db);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM control_dashboards`)
    .get() as { n: number };
  return row.n;
}

export function deleteControlDashboard(db: BetterDatabase, id: number): boolean {
  ensureControlDashboardSchema(db);
  const result = db.prepare(`DELETE FROM control_dashboards WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function listControlDashboardWidgets(
  db: BetterDatabase,
  dashboardId: number,
): ControlDashboardWidgetRow[] {
  return db
    .prepare(
      `SELECT ${WIDGET_COLUMNS}
       FROM control_dashboard_widgets
       WHERE dashboard_id = ?
       ORDER BY grid_y ASC, grid_x ASC, id ASC`,
    )
    .all(dashboardId) as ControlDashboardWidgetRow[];
}

export function replaceControlDashboardWidgets(
  db: BetterDatabase,
  dashboardId: number,
  widgets: ControlWidgetInput[],
): ControlDashboardWidgetRow[] {
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM control_dashboard_widgets WHERE dashboard_id = ?').run(dashboardId);

    const insert = db.prepare(
      `INSERT INTO control_dashboard_widgets(
         dashboard_id, widget_type, grid_x, grid_y, grid_w, grid_h,
         macro_id, clip_id, gif_provider, gif_external_id, markdown_body
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const widget of widgets) {
      insert.run(
        dashboardId,
        widget.widget_type,
        widget.grid_x,
        widget.grid_y,
        widget.grid_w,
        widget.grid_h,
        widget.macro_id ?? null,
        widget.clip_id ?? null,
        widget.gif_provider ?? null,
        widget.gif_external_id ?? null,
        widget.markdown_body ?? null,
      );
    }

    db.prepare(
      `UPDATE control_dashboards
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(dashboardId);
  });

  replace();
  return listControlDashboardWidgets(db, dashboardId);
}
