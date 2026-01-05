import { z } from 'zod';

export const mediaTypeEnum = z.enum(['image', 'video']);

export const createMediaSchema = z.object({
  type: mediaTypeEnum,
  url: z.string().url().max(1000),
  s3Key: z.string().max(500),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
  eventId: z.string().uuid().optional(),
  talentId: z.string().uuid().optional(),
  isCover: z.boolean().optional(),
}).refine(data => !data.eventId !== !data.talentId, {
  message: 'Media must belong to either an event or a talent, not both or neither',
});
