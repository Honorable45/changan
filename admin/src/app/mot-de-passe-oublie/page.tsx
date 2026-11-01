'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { btnPrimary, Field, input, Notice } from '@/components/ui';
import { api } from '@/lib/admin';

export default function Forgot() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api('/admin/auth/forgot', { body: { email: new FormData(e.currentTarget).get('email') } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }
  return (
    <AuthCard title="Mot de passe oublié">
      {sent ? <Notice kind="ok">Si ce compte existe, un lien valable 30 minutes vient d’être envoyé.</Notice> : (
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Courriel"><input name="email" type="email" required className={input} /></Field>
          <Notice kind="error">{error}</Notice>
          <button className={btnPrimary}>Recevoir le lien</button>
        </form>
      )}
      <Link href="/connexion" className="mt-4 block text-sm text-steel underline">Retour à la connexion</Link>
    </AuthCard>
  );
}
