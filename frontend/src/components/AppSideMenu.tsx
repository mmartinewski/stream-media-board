import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/settings/layout-areas', label: 'Layout areas', end: false },
  { to: '/clips/new', label: 'New clip', end: false },
] as const;

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
        className="rounded-md border border-surface px-2.5 py-2 text-lg leading-none text-text-muted hover:border-accent hover:text-text"
      >
        ⋮
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
                className="fixed inset-y-0 right-0 z-[61] flex w-72 max-w-[85vw] flex-col border-l border-surface bg-bg shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-surface/50 px-4 py-3">
                  <span className="text-sm font-semibold">Menu</span>
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
                          'rounded-md px-3 py-2.5 text-sm font-medium transition-colors ' +
                          (active
                            ? 'bg-accent/15 text-text'
                            : 'text-text-muted hover:bg-surface-soft hover:text-text')
                        }
                      >
                        {item.label}
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
