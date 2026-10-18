import { getCollection, type CollectionEntry } from 'astro:content';
import site from '../data/site.json';
import locations from '../data/locations.json';
import typesData from '../data/types.json';
import { noindexPaths } from './noindex.mjs';

export type Property = CollectionEntry<'properties'>;
export const SITE = site;
export const CITIES = locations.cities;
export const PRIMARY_CITIES = CITIES.filter((c) => c.primary);
export const TYPES = typesData.types;
export const STATUS = { sale: 'للبيع', rent: 'للإيجار' } as const;
export const STATUS_SLUG = { sale: 'for-sale', rent: 'for-rent' } as const;

const NOINDEX = new Set(noindexPaths());
export const isNoindex = (path: string) => NOINDEX.has(path);

export async function getProperties() {
  const all = await getCollection('properties', (p) => p.data.available);
  return all.sort((a, b) => +b.data.date - +a.data.date);
}

export const cityOf = (slug: string) => CITIES.find((c) => c.slug === slug)!;
export const districtOf = (city: string, d: string) => cityOf(city)?.districts.find((x) => x.slug === d);
export const typeByKey = (k: string) => TYPES.find((t) => t.key === k)!;
export const typeBySlug = (s: string) => TYPES.find((t) => t.slug === s)!;

export const propertyUrl = (p: Property) => `/properties/${p.id}/`;
export const cityUrl = (c: string) => `/${c}/`;
export const districtUrl = (c: string, d: string) => `/${c}/${d}/`;
export const cityTypeUrl = (c: string, typeSlug: string, status: 'sale' | 'rent') => `/${c}/${typeSlug}-${STATUS_SLUG[status]}/`;

/** "حي الحمراء، الخبر" */
export function placeLabel(p: Property) {
  const c = cityOf(p.data.city);
  const d = districtOf(p.data.city, p.data.district);
  return `${d ? 'حي ' + d.name.replace(/\s*\(.*\)/, '') + '، ' : ''}${c?.name ?? ''}`;
}

const nf = new Intl.NumberFormat('en-US');
export const fmt = (n: number) => nf.format(n);
export function priceLabel(p: Property) {
  const { price, priceNote, status, rentPeriod } = p.data;
  if (price) return `${fmt(price)} ر.س${status === 'rent' ? (rentPeriod === 'monthly' ? ' / شهريًا' : ' / سنويًا') : ''}`;
  return priceNote || 'السعر عند التواصل';
}

export function waLink(text: string) {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
}
export function propertyWa(p: Property, origin = 'https://alothman.com.sa') {
  return waLink(`السلام عليكم، أرغب بالاستفسار عن: ${p.data.title}${p.data.ref ? ` (رقم ${p.data.ref})` : ''}\n${origin}${propertyUrl(p)}`);
}

export function typeLabelFor(p: Property) {
  return typeByKey(p.data.type).single;
}

/** Facts that actually exist on the listing — nothing is invented. */
export function facts(p: Property) {
  const d = p.data;
  const f: { k: string; v: string; icon: string }[] = [];
  if (d.area) f.push({ k: 'المساحة', v: `${fmt(d.area)} م²`, icon: 'area' });
  if (d.bedrooms) f.push({ k: 'غرف النوم', v: String(d.bedrooms), icon: 'bed' });
  if (d.bathrooms) f.push({ k: 'دورات المياه', v: String(d.bathrooms), icon: 'bath' });
  if (d.livingRooms) f.push({ k: 'الصالات', v: String(d.livingRooms), icon: 'sofa' });
  if (d.floors) f.push({ k: 'الأدوار', v: String(d.floors), icon: 'floors' });
  if (d.streetWidth) f.push({ k: 'عرض الشارع', v: `${d.streetWidth} م`, icon: 'road' });
  if (d.facing) f.push({ k: 'الواجهة', v: d.facing, icon: 'compass' });
  if (d.age) f.push({ k: 'عمر العقار', v: d.age, icon: 'clock' });
  return f;
}
