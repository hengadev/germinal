import { z } from 'zod';

export const senderEmailSchema = z.object({
    senderEmail: z.string()
        .min(1, 'Email requis')
        .email('Adresse email invalide')
        .max(255, 'Email must be less than 255 characters')
        .toLowerCase(),
});

export type SenderEmailInput = z.infer<typeof senderEmailSchema>;
