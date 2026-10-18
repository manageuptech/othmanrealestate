import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const properties = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/properties' }),
  schema: z.object({
    title: z.string(),
    ref: z.string().optional(),
    status: z.enum(['sale', 'rent']),
    type: z.enum(['apartment', 'villa', 'land', 'building', 'commercial', 'resthouse']),
    city: z.string(),
    district: z.string(),
    street: z.string().optional().nullable(),
    price: z.number().optional().nullable(),
    oldPrice: z.number().optional().nullable(),
    priceNote: z.string().optional().nullable(),
    rentPeriod: z.enum(['yearly', 'monthly']).optional().nullable(),
    area: z.number().optional().nullable(),
    bedrooms: z.number().optional().nullable(),
    bathrooms: z.number().optional().nullable(),
    livingRooms: z.number().optional().nullable(),
    floors: z.number().optional().nullable(),
    streetWidth: z.number().optional().nullable(),
    facing: z.string().optional().nullable(),
    age: z.string().optional().nullable(),
    features: z.array(z.string()).default([]),
    cover: z.string().optional().nullable(),
    images: z.array(z.string()).default([]),
    video: z.string().optional().nullable(),
    mapUrl: z.string().url().optional().nullable(),
    featured: z.boolean().default(false),
    available: z.boolean().default(true),
    date: z.coerce.date(),
    summary: z.string(),
  }),
});

export const collections = { properties };
