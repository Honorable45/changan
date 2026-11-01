'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { btnPrimary, Field, input, Notice } from '@/components/ui';
import { api } from '@/lib/admin';

function Form() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api('/admin/auth/reset', { body: { token, password: new FormData(e.currentTarget).get('password') } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }
  if (done) return <><Notice kind="ok">Mot de passe modifié. Toutes les sessions ont été fermées.</Notice><Link href="/connexion" className="mt-4 block underline">Se connecter</Link></>;
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Nouveau mot de passe" hint="12 caractères minimum"><input name="password" type="password" required minLength={12} autoComplete="new-password" className={input} /></Field>
      <Notice kind="error">{error}</Notice>
      <button className={btnPrimary}>Enregistrer</button>
    </form>
  );
}

export default function Reset() {
  return <AuthCard title="Nouveau mot de passe"><Suspense><Form /></Suspense></AuthCard>;
}
