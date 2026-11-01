'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { btnPrimary, Field, input, Notice } from '@/components/ui';
import { api } from '@/lib/admin';

export default function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      await api('/admin/auth/login', { body: { email: f.get('email'), password: f.get('password') } });
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Connexion">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Courriel"><input name="email" type="email" required autoComplete="username" className={input} /></Field>
        <Field label="Mot de passe"><input name="password" type="password" required autoComplete="current-password" className={input} /></Field>
        <Notice kind="error">{error}</Notice>
        <button className={btnPrimary} disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <Link href="/mot-de-passe-oublie" className="text-sm text-steel underline">Mot de passe oublié</Link>
      </form>
    </AuthCard>
  );
}
