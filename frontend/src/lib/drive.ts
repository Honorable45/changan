/** Vues de profil animables, relevées sur la photo : centre et rayon des jantes en % de l'image. */
export type DriveWheel = { cx: number; cy: number; rx: number; ry: number; aspect: number };
export type DriveColor = { id: string; label: string; swatch: string; src: string; srcSet: string };
const tinted = (id: string, label: string, swatch: string): DriveColor => ({
  id, label, swatch, src: `/hero/uni-k-${id}-1280.webp`, srcSet: `/hero/uni-k-${id}-1280.webp 1280w, /hero/uni-k-${id}-2400.webp 2400w`,
});
export type DriveView = {
  src: string;
  srcSet: string;
  ratio: number;
  /** Première entrée : la couleur réelle de la photo. Les suivantes sont simulées par scripts/hero-colors.cjs. */
  colors: DriveColor[];
  wheels: DriveWheel[];
  headlight: { x: number; y: number };
  taillight: { x: number; y: number };
  /** Pente de la ligne qui joint les deux points de contact au sol : la voiture avance dans cet axe, pas à l'horizontale. */
  slope: number;
};

export const DRIVE_VIEWS: Record<string, DriveView> = {
  'uni-k': {
    src: '/hero/uni-k-profil-1280.webp',
    srcSet: '/hero/uni-k-profil-1280.webp 1280w, /hero/uni-k-profil-2400.webp 2400w',
    ratio: 2678 / 1015,
    colors: [
      { ...tinted('profil', 'Bleu clair', '#a9bfd8') },
      tinted('blanc', 'Blanc', '#ecedee'),
      tinted('noir', 'Noir', '#26282c'),
      tinted('gris', 'Gris', '#70747a'),
      tinted('bleu', 'Bleu', '#1c346e'),
    ],
    wheels: [
      { cx: 14.86, cy: 72.32, rx: 5.9, ry: 16.16, aspect: 158 / 164 },
      { cx: 75.13, cy: 78.23, rx: 6.35, ry: 16.75, aspect: 1 },
    ],
    headlight: { x: 5.3, y: 37 },
    taillight: { x: 91.3, y: 32.9 },
    slope: 0.04,
  },
};

/** Part du défilement consacrée au démarrage : la voiture accélère, puis suit le défilement à vitesse constante. */
const START = 0.06;

/** Distance parcourue (0 à 1) pour un défilement donné (0 à 1). Vitesse continue au passage du démarrage à la route. */
export function driveDistance(progress: number) {
  const p = Math.min(Math.max(progress, 0), 1);
  return (p < START ? (p * p) / (2 * START) : p - START / 2) / (1 - START / 2);
}

/** Inverse de driveDistance sur la route : le défilement qui correspond à une distance, passé le démarrage. */
export function driveProgress(distance: number) {
  return distance * (1 - START / 2) + START / 2;
}

/** Cabrage de la voiture à l'accélération, de 0 à 1 puis retour à 0. */
export function drivePitch(progress: number) {
  return progress <= 0 || progress >= START ? 0 : Math.sin((Math.PI * progress) / START);
}

/** Le pneu dépasse la jante : c'est son rayon qui fixe la rotation pour que la roue ne glisse pas. */
export const TYRE_TO_RIM = 1.35;
