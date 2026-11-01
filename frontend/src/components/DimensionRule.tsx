import type { Spec } from '@/lib/types';

const mm = (v?: string) => { const m = v?.replace(/\s/g, '').match(/^\d+/); return m ? Number(m[0]) : null; };

/** Signature graphique : les dimensions tracées à l'échelle réelle, comme une cote de plan. */
export function DimensionRule({ specs }: { specs: Spec[] }) {
  const get = (k: string) => specs.find((s) => s.key === k);
  const length = mm(get('length')?.value);
  if (!length) return null;
  const rows = [get('length'), get('wheelbase'), get('width'), get('height')].filter((s): s is Spec => !!s && !!mm(s.value));
  return (
    <div className="grid gap-5" aria-hidden="true">
      {rows.map((s) => (
        <div key={s.id}>
          <div className="flex items-baseline justify-between text-sm"><span className="text-steel">{s.label}</span><span className="num">{s.value}</span></div>
          <div className="relative mt-2 h-2 border-x border-ink" style={{ width: `${(mm(s.value)! / length) * 100}%` }}><span className="absolute inset-x-0 top-1/2 h-px bg-ink" /></div>
        </div>
      ))}
    </div>
  );
}
