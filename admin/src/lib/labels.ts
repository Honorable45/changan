export const ENERGY: Record<string, string> = {
  PETROL: 'Essence', DIESEL: 'Diesel', HYBRID: 'Hybride', PLUG_IN_HYBRID: 'Hybride rechargeable', RANGE_EXTENDER: 'Prolongateur d’autonomie', ELECTRIC: 'Électrique',
};
export const AVAILABILITY: Record<string, string> = {
  UNCONFIRMED: 'Disponibilité à confirmer', AVAILABLE: 'Disponible', ON_ORDER: 'Sur commande', UNAVAILABLE: 'Indisponible',
};
export const COMMERCIAL: Record<string, string> = {
  TO_CONFIRM: 'Commercialisation au Togo à confirmer', MARKETED_TOGO: 'Commercialisé au Togo',
};
export const SPEC_GROUP: [string, string][] = [
  ['POWERTRAIN', 'Motorisation'], ['DIMENSIONS', 'Dimensions'], ['COMFORT', 'Confort'], ['TECHNOLOGY', 'Technologies'], ['SAFETY', 'Sécurité'], ['COMMERCIAL', 'Informations commerciales'],
];
export const VIEW: Record<string, string> = {
  FRONT: 'Avant', REAR: 'Arrière', SIDE: 'Profil', THREE_QUARTER: 'Trois-quarts', INTERIOR: 'Habitacle', DASHBOARD: 'Tableau de bord', SEATS: 'Sièges', TRUNK: 'Coffre', WHEELS: 'Jantes', LIGHTS: 'Phares', DETAIL: 'Détail', OTHER: 'Autre',
};
export const REQUEST_TYPE: Record<string, string> = { PRICE: 'Demande de prix', TEST_DRIVE: 'Essai routier', INFORMATION: 'Information' };
export const REQUEST_STATUS: Record<string, string> = { NEW: 'Nouvelle', IN_PROGRESS: 'En cours', CLOSED: 'Clôturée' };
export const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' ')} FCFA`;
export const energyLine = (e: string[]) => e.map((x) => ENERGY[x]).join(' · ');
