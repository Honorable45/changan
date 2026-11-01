export type Source = { size: string; url: string };
export type Media = {
  id: string; kind: 'IMAGE' | 'VIDEO' | 'MODEL_3D' | 'SPIN_FRAME'; view: string; alt: string; width: number | null; height: number | null;
  dominantColor: string | null; isPrimary: boolean; position: number; colorId: string | null; credit: string | null; license: string | null;
  licenseUrl: string | null; sourceUrl: string | null; sources: Source[]; cutoutSources?: Source[]; cutoutWidth?: number | null; cutoutHeight?: number | null;
};
export type Category = { id: string; slug: string; name: string; count?: number };
export type VehicleCard = {
  id: string; slug: string; name: string; tagline: string | null; category: Category; energies: string[]; commercialStatus: string;
  availability: string; isNew: boolean; isDemo: boolean; priceFromFcfa: number | null; engine: string | null; image: Media | null;
};
export type Version = { id: string; name: string; year: number | null; priceFcfa: number | null };
export type Spec = { id: string; group: string; key: string | null; label: string; value: string; verification: string; sourceLabel: string | null; sourceUrl: string | null };
export type Color = { id: string; name: string; hex: string | null };
export type VehicleDetail = Omit<VehicleCard, 'image' | 'engine' | 'priceFromFcfa'> & {
  summary: string | null; versions: Version[]; specifications: Spec[]; colors: Color[]; media: Media[]; similar: VehicleCard[];
};
export type Site = {
  demoMode: boolean; hero: VehicleCard | null; featured: VehicleCard | null; logoUrl: string | null; whatsappNumber: string | null; phone: string | null;
  email: string | null; address: string | null; openingHours: string | null; facebookUrl: string | null; instagramUrl: string | null; tiktokUrl: string | null;
  youtubeUrl: string | null; linkedinUrl: string | null; dealerName: string | null; warrantyText: string | null; testDriveConditions: string | null;
  legalNotice: string | null; privacyPolicy: string | null;
};
export type Facets = { energies: string[]; availabilities: string[]; priceRange: { min: number; max: number } | null };
export type Credit = { id: string; alt: string; credit: string | null; license: string | null; licenseUrl: string | null; sourceUrl: string | null; vehicle: { name: string } };
