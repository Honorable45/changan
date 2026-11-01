/** Logo officiel s'il est renseigné dans l'administration ; sinon le nom en texte, sans imitation du symbole. */
export function Logo({ url, className = '' }: { url?: string | null; className?: string }) {
  if (url) return <img src={url} alt="CHANGAN Togo" className={`h-7 w-auto ${className}`} />;
  return (
    <span className={`whitespace-nowrap text-[1.05rem] font-semibold tracking-[0.2em] ${className}`} style={{ fontStretch: '118%' }}>
      CHANGAN <span className="font-normal opacity-70">TOGO</span>
    </span>
  );
}
