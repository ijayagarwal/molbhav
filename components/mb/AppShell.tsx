"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DealersBold, OrdersBold, PinBold, PlusBold, SettingsBold, XBold } from "./icons";

// The app's frame at every width (DESIGN §18, §19, D5). Props only; one DOM for all breakpoints.
// - Phone (< 768) and tablet (768–1023): a 56 px top bar, the main column (max 640 on tablet) and a bottom
//   dock that respects the safe area; the call panel is a right slide-over drawer.
// - Desk 1024–1279: a 72 px icon rail, main (max 760) and a 400 px overlay drawer for the selected call.
// - 1280–1535: the 400 px call panel is docked.
// - ≥ 1536: a 300 px "Bahi" order list, main (max 840) and a 420 px docked panel.

export interface RailItem {
  key: string;
  label: string;
  icon: "new" | "orders" | "sites" | "dealers";
  active?: boolean;
  /** A small haldi dot: something is running there. */
  live?: boolean;
  liveLabel?: string;
  onClick?: () => void;
}

const RAIL_ICON = { new: PlusBold, orders: OrdersBold, sites: PinBold, dealers: DealersBold } as const;

export function IconRail({ homeLabel, mark, items, settingsLabel, onSettings }: { homeLabel: string; mark: string; items: RailItem[]; settingsLabel: string; onSettings?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center gap-3 py-4">
      <a href="/app" aria-label={homeLabel} className="mb-2 flex size-14 items-center justify-center rounded-card border-2 border-ink bg-haldi font-display text-title-2 shadow-paint-sm">
        {mark}
      </a>
      {items.map((it) => {
        const Icon = RAIL_ICON[it.icon];
        const look =
          it.icon === "new"
            ? "border-2 border-ink bg-card shadow-paint-sm"
            : it.active
              ? "bg-ink text-paper"
              : "text-ink hover:bg-cement";
        return (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            aria-label={it.live && it.liveLabel ? `${it.label} · ${it.liveLabel}` : it.label}
            aria-current={it.active ? "page" : undefined}
            title={it.label}
            className={`relative flex size-14 items-center justify-center rounded-card ${look}`}
          >
            <Icon className="size-6" />
            {it.live ? <span aria-hidden="true" className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-paper bg-haldi" /> : null}
          </button>
        );
      })}
      <div className="flex-1" />
      <button type="button" onClick={onSettings} aria-label={settingsLabel} title={settingsLabel} className="flex size-14 items-center justify-center rounded-card text-ink hover:bg-cement">
        <SettingsBold className="size-6" />
      </button>
    </div>
  );
}

interface ShellProps {
  /** Phone/tablet top bar contents (56 px). Hidden on desk. */
  topBar: ReactNode;
  rail: ReactNode;
  /** The ≥ 1536 order list. */
  bahi?: ReactNode;
  children: ReactNode;
  /** Phone/tablet bottom dock (mic, or the sweep's stop/notify footer). */
  phoneDock?: ReactNode;
  /** Desk voice dock at the bottom of the main column. */
  deskDock?: ReactNode;
  /** The selected call's panel. */
  panel?: ReactNode;
  panelOpen: boolean;
  onClosePanel: () => void;
  closeLabel: string;
  panelLabel: string;
  navLabel: string;
  /** Focus returns here when the drawer closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Matches a media query on the client (false on the server, so hydration never mismatches). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside a modal dialog (the call drawer, a bottom sheet): the ends wrap around. */
function keepTabInside(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const inside = root.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

export function AppShell({ topBar, rail, bahi, children, phoneDock, deskDock, panel, panelOpen, onClosePanel, closeLabel, panelLabel, navLabel, returnFocusRef }: ShellProps) {
  // From 1280 px the panel is docked: no drawer state. Narrowing the window later must not pop a stale drawer open.
  const docked = useMedia("(min-width: 1280px)");
  const drawer = panelOpen && !docked;
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (docked && panelOpen) onClosePanel();
  }, [docked, panelOpen, onClosePanel]);

  const close = useCallback(() => onClosePanel(), [onClosePanel]);

  // Focus returns to the row that opened the drawer on every close path, once the page is no longer
  // inert (focusing while it still is would silently fail).
  const wasDrawer = useRef(false);
  useEffect(() => {
    if (wasDrawer.current && !drawer) returnFocusRef?.current?.focus();
    wasDrawer.current = drawer;
  }, [drawer, returnFocusRef]);

  // The drawer is a modal dialog (review of 2B): focus moves to Close, Tab stays inside, Esc closes, and
  // focus returns to the row that opened it on every close path.
  useEffect(() => {
    if (!drawer) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab" && panelRef.current) keepTabInside(e, panelRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, close]);

  return (
    <div
      className={`min-h-dvh bg-paper lg:grid lg:h-dvh lg:grid-cols-[72px_minmax(0,1fr)] ${panel === undefined ? "2xl:grid-cols-[72px_300px_minmax(0,1fr)]" : "xl:grid-cols-[72px_minmax(0,1fr)_400px] 2xl:grid-cols-[72px_300px_minmax(0,1fr)_420px]"}`}
    >
      <nav aria-label={navLabel} inert={drawer} className="hidden border-r border-rule bg-paper lg:block">
        {rail}
      </nav>
      {bahi ? (
        <aside inert={drawer} className="hidden overflow-y-auto border-r border-rule 2xl:block">
          {bahi}
        </aside>
      ) : (
        <div className="hidden 2xl:block" />
      )}

      <div inert={drawer} className="flex min-w-0 flex-col lg:h-dvh lg:overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-rule bg-paper px-4 lg:hidden">{topBar}</header>
        <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-[calc(224px+env(safe-area-inset-bottom))] pt-4 lg:max-w-[760px] lg:px-6 lg:pb-6 lg:pt-6 2xl:max-w-[840px]">
          {children}
        </main>
        {deskDock ? <div className="sticky bottom-0 hidden border-t border-rule bg-paper lg:block">{deskDock}</div> : null}
      </div>

      {/* The call panel: a modal drawer under 1280 px, docked from 1280. Scrims are ink at 50% (DESIGN §7).
          Screens without a panel get no panel column at all. */}
      {drawer ? <div aria-hidden="true" onClick={close} className="fixed inset-0 z-30 bg-ink/50" /> : null}
      {panel === undefined ? null : (
      <aside
        ref={panelRef}
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer ? true : undefined}
        aria-label={panelLabel}
        className={`fixed inset-y-0 right-0 z-40 w-[min(400px,100vw)] overflow-y-auto border-l border-rule bg-paper p-5 transition-transform duration-200 xl:static xl:z-auto xl:w-auto xl:translate-x-0 ${drawer ? "translate-x-0" : "invisible translate-x-full xl:visible"}`}
      >
        <div className="mb-2 flex justify-end xl:hidden">
          <button ref={closeRef} type="button" onClick={close} aria-label={closeLabel} className="flex size-14 items-center justify-center rounded-card border border-rule bg-card">
            <XBold className="size-5" />
          </button>
        </div>
        {panel}
      </aside>
      )}

      {phoneDock ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
          <div className="mx-auto w-full max-w-[640px]">{phoneDock}</div>
        </div>
      ) : null}
    </div>
  );
}

const subscribeNothing = () => () => undefined;

/**
 * A bottom sheet (DESIGN §20): over a scrim, overscroll contained, and above the on-screen keyboard
 * (the root viewport uses interactiveWidget "resizes-content", so a fixed bottom edge rides the keyboard).
 * It is a modal dialog like the call drawer: it renders at the end of <body>, focus moves into it (its first
 * control, else Close), Tab stays inside, the page behind is inert, Esc closes, and focus returns to the
 * control that opened it. `inline` (the styleguide) renders in place with none of that.
 */
export function BottomSheet({ open, title, onClose, closeLabel, children, inline = false }: { open: boolean; title: string; onClose: () => void; closeLabel: string; children: ReactNode; inline?: boolean }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Screens pass a fresh onClose on every render; the dialog effect must not re-run (and re-focus) for that.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // The portal needs document.body: false while hydrating, true afterwards.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const modal = open && !inline && mounted;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!modal || !sheet) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The sheet is a child of <body>, so everything else on the page is one of its siblings.
    const behind = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== sheet && !el.inert);
    for (const el of behind) el.inert = true;
    (bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? closeRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") keepTabInside(e, sheet);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // The page leaves inert first: focusing the trigger while it still is would silently fail.
      for (const el of behind) el.inert = false;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [modal]);

  if (!open || (!inline && !mounted)) return null;
  const sheet = (
    <div ref={sheetRef} className={inline ? "relative" : "fixed inset-0 z-50 flex flex-col justify-end"} role="dialog" aria-modal={!inline} aria-label={title}>
      {inline ? null : <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink/50" />}
      <div className={`relative mx-auto flex max-h-[85dvh] w-full max-w-[640px] flex-col gap-4 overflow-y-auto rounded-t-sheet bg-paper px-4 pt-3 [overscroll-behavior:contain] ${inline ? "rounded-b-card border border-rule pb-4" : "pb-[max(16px,env(safe-area-inset-bottom))]"}`}>
        <span aria-hidden="true" className="mx-auto h-1.5 w-11 rounded-full bg-rule" />
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-title-2">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={closeLabel} className="flex size-14 shrink-0 items-center justify-center rounded-card border border-rule bg-card">
            <XBold className="size-5" />
          </button>
        </div>
        <div ref={bodyRef} className="contents">
          {children}
        </div>
      </div>
    </div>
  );
  return inline ? sheet : createPortal(sheet, document.body);
}
