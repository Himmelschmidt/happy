import * as z from 'zod';
import { MessageMetaSchema } from './messageMeta';

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({
      type: z.literal('image'),
      text: z.string(),
      images: z.array(z.object({
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
        base64: z.string(),
      })),
    }),
  ]),
  localKey: z.string().optional(),
  meta: MessageMetaSchema.optional(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export const AgentMessageSchema = z.object({
  role: z.literal('agent'),
  content: z
    .object({
      type: z.string(),
    })
    .passthrough(),
  meta: MessageMetaSchema.optional(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const LegacyMessageContentSchema = z.discriminatedUnion('role', [UserMessageSchema, AgentMessageSchema]);
export type LegacyMessageContent = z.infer<typeof LegacyMessageContentSchema>;
