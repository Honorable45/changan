export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md bg-paper p-8">
        <p className="eyebrow text-steel">CHANGAN Togo</p>
        <h1 className="display mt-2 text-3xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
