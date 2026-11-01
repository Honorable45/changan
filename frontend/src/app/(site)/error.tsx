'use client';

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="shell py-32">
      <h1 className="display text-4xl">Cette page n’a pas pu être chargée.</h1>
      <p className="mt-4 text-steel">Le catalogue est momentanément indisponible.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-8">Réessayer</button>
    </div>
  );
}
