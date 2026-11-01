'use client';
import { FormEvent, useEffect, useState } from 'react';
import { btnPrimary, Check, Field, input, Notice } from '@/components/ui';
import { api } from '@/lib/admin';

type S = Record<string, string | boolean | null>;
const TEXT: [string, string, string?][] = [
  ['dealerName', 'Nom du concessionnaire'], ['whatsappNumber', 'Numéro WhatsApp professionnel', 'Avec indicatif pays, par exemple 228… Laisser vide pour n’utiliser que le formulaire.'],
  ['phone', 'Téléphone'], ['email', 'Courriel'], ['address', 'Adresse'], ['openingHours', 'Horaires'],
  ['logoUrl', 'URL du logo officiel'], ['facebookUrl', 'Facebook'], ['instagramUrl', 'Instagram'], ['tiktokUrl', 'TikTok'], ['youtubeUrl', 'YouTube'], ['linkedinUrl', 'LinkedIn'],
];
const LONG: [string, string][] = [['testDriveConditions', 'Conditions d’essai routier'], ['warrantyText', 'Conditions de garantie'], ['legalNotice', 'Mentions légales'], ['privacyPolicy', 'Politique de confidentialité (remplace le texte par défaut)']];

export default function HomeSettings() {
  const [s, setS] = useState<S | null>(null);
  const [vehicles, setVehicles] = useState<{ id: string; name: string; published: boolean }[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    Promise.all([api<S>('/admin/settings').then(setS), api<{ id: string; name: string; published: boolean }[]>('/admin/vehicles').then(setVehicles)])
      .catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, []);
  if (!s) return msg ? <Notice kind="error">{msg.text}</Notice> : <p role="status" className="text-sm text-steel">Chargement…</p>;
  const set = (k: string, v: string | boolean | null) => setS({ ...s, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { id: _id, updatedAt: _u, ...body } = s!;
    try {
      const saved = await api<S>('/admin/settings', { method: 'PUT', body });
      setS(saved);
      setMsg({ kind: 'ok', text: 'Paramètres enregistrés. Le site public est à jour sous 15 secondes.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Erreur' });
    }
  }
  const published = vehicles.filter((v) => v.published);
  return (
    <form onSubmit={save} className="grid gap-6">
      <h1 className="display text-3xl">Accueil et coordonnées</h1>
      <section className="grid gap-4 bg-paper p-6 md:grid-cols-2">
        <h2 className="font-medium md:col-span-2">Mises en avant</h2>
        <Field label="Véhicule de la première section"><select value={(s.heroVehicleId as string) ?? ''} onChange={(e) => set('heroVehicleId', e.target.value || null)} className={input}><option value="">Premier de la gamme</option>{published.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Modèle à la une"><select value={(s.featuredVehicleId as string) ?? ''} onChange={(e) => set('featuredVehicleId', e.target.value || null)} className={input}><option value="">Aucun</option>{published.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <div className="md:col-span-2"><Check label="Mode démonstration (bandeau visible, site exclu des moteurs de recherche)" checked={s.demoMode === true} onChange={(v) => set('demoMode', v)} /></div>
      </section>
      <section className="grid gap-4 bg-paper p-6 md:grid-cols-2">
        <h2 className="font-medium md:col-span-2">Coordonnées et réseaux</h2>
        <p className="text-sm text-steel md:col-span-2">Saisir uniquement des informations vérifiées. Un champ vide reste masqué sur le site.</p>
        {TEXT.map(([k, label, hint]) => <Field key={k} label={label} hint={hint}><input value={(s[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} className={input} /></Field>)}
      </section>
      <section className="grid gap-4 bg-paper p-6">
        <h2 className="font-medium">Textes</h2>
        {LONG.map(([k, label]) => <Field key={k} label={label}><textarea rows={4} value={(s[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} className={input} /></Field>)}
      </section>
      <div className="sticky bottom-0 flex items-center gap-4 border-t border-line bg-mist py-3"><button className={btnPrimary}>Enregistrer</button>{msg && <Notice kind={msg.kind}>{msg.text}</Notice>}</div>
    </form>
  );
}
