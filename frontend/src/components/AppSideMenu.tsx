import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { GridViewIcon } from '../contexts/DashboardViewContext';
import { APP_DISPLAY_NAME } from '../lib/appName';

const NAV_ICON_CLASS = 'h-4 w-4 shrink-0 opacity-80';

const NAV_ITEMS: ReadonlyArray<{
  to: string;
  label: string;
  end: boolean;
  icon: ReactNode;
}> = [
  { to: '/', label: 'Media Board', end: true, icon: <GridViewIcon className={NAV_ICON_CLASS} /> },
  {
    to: '/checklists',
    label: 'Checklists',
    end: false,
    icon: <ChecklistsIcon className={NAV_ICON_CLASS} />,
  },
  {
    to: '/settings/layout-areas',
    label: 'Layout areas',
    end: false,
    icon: <LayoutAreasIcon className={NAV_ICON_CLASS} />,
  },
];

export default function AppSideMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open navigation menu"
        className="flex shrink-0 items-center justify-center rounded-md border border-surface px-2.5 py-2 text-text-muted hover:border-accent hover:text-text"
      >
        <MenuIcon />
      </button>
      {open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={close}
                className="fixed inset-0 z-[60] cursor-default bg-black/60"
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                className="fixed inset-y-0 left-0 z-[61] flex w-72 max-w-[85vw] flex-col border-r border-surface bg-bg shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-surface/50 px-4 py-3">
                  <span className="text-sm font-semibold">{APP_DISPLAY_NAME}</span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close menu"
                    className="rounded-md px-2 py-1 text-xl leading-none text-text-muted hover:bg-surface-soft hover:text-text"
                  >
                    ×
                  </button>
                </div>
                <nav className="flex flex-col gap-1 p-3">
                  {NAV_ITEMS.map((item) => {
                    const active = item.end
                      ? pathname === item.to
                      : pathname === item.to || pathname.startsWith(`${item.to}/`);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={close}
                        className={
                          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ' +
                          (active
                            ? 'bg-accent/15 text-text'
                            : 'text-text-muted hover:bg-surface-soft hover:text-text')
                        }
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </aside>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChecklistsIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <rect x="3" y="4" width="5" height="5" rx="1" />
      <path d="M4.5 6.5 5.8 7.8 7.5 5.5" />
      <path d="M10 6.5h7" />
      <rect x="3" y="11" width="5" height="5" rx="1" />
      <path d="M10 13.5h7" />
    </svg>
  );
}

function LayoutAreasIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <path d="M3 10h14M10 3v14" />
    </svg>
  );
}
