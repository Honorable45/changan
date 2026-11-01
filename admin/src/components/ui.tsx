'use client';
import { useState } from 'react';

export const input = 'w-full border border-line bg-paper px-3 py-2.5 text-[0.9375rem] focus:border-ink focus:outline-none';
export const btn = 'inline-flex min-h-10 items-center justify-center border border-line bg-paper px-3 text-sm font-medium hover:border-ink disabled:opacity-50';
export const btnPrimary = 'inline-flex min-h-10 items-center justify-center bg-ink px-4 text-sm font-medium text-white hover:bg-accent disabled:opacity-50';
export const btnDanger = 'inline-flex min-h-10 items-center justify-center border border-red-700 px-3 text-sm font-medium text-red-800 hover:bg-red-700 hover:text-white';

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-steel">{hint}</span>}
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-ink)]" />{label}
    </label>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: React.ReactNode }) {
  if (!children) return null;
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`border-l-2 py-1 pl-3 text-sm ${kind === 'error' ? 'border-red-700 text-red-800' : 'border-green-700 text-green-900'}`}>{children}</p>;
}

/** Suppression en deux temps, sans fenêtre native : le second clic confirme. */
export function ConfirmDelete({ onConfirm, label = 'Supprimer', confirmLabel = 'Confirmer la suppression' }: { onConfirm: () => void | Promise<void>; label?: string; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <button type="button" className={btnDanger} onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="inline-flex gap-1">
      <button type="button" className="inline-flex min-h-10 items-center bg-red-700 px-3 text-sm font-medium text-white" onClick={() => { setArmed(false); void onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className={btn} onClick={() => setArmed(false)}>Annuler</button>
    </span>
  );
}
