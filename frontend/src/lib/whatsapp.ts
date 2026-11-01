export type RequestKind = 'PRICE' | 'TEST_DRIVE' | 'INFORMATION';

export function whatsappMessage(kind: RequestKind, model?: string, version?: string) {
  const car = model ? `CHANGAN ${model}${version ? `, version ${version}` : ''}` : '';
  if (kind === 'PRICE') return `Bonjour, je souhaite obtenir des informations sur le ${car}. Pourriez-vous me communiquer son prix et sa disponibilité au Togo ?`;
  if (kind === 'TEST_DRIVE') return `Bonjour, je souhaite réserver un essai routier${car ? ` du ${car}` : ''}. Pourriez-vous me proposer un rendez-vous ?`;
  return car ? `Bonjour, je souhaite obtenir des informations sur le ${car}.` : 'Bonjour, je souhaite obtenir des informations sur la gamme CHANGAN au Togo.';
}

/** wa.me redirige vers WhatsApp Web lorsque l'application n'est pas installée. */
export const whatsappUrl = (number: string, message: string) => `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
