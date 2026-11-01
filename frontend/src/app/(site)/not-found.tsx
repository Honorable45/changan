import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell py-32">
      <h1 className="display text-4xl">Cette page n’existe pas.</h1>
      <Link href="/vehicules" className="btn btn-primary mt-8">Voir la gamme</Link>
    </div>
  );
}
