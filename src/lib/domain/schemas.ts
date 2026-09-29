import { z } from "zod";

export const createGrantSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(180),
  funder: z.string().trim().min(2, "Funder must be at least 2 characters.").max(180),
});

export const draftSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(12, "Tell the drafter what to write, in at least 12 characters.")
    .max(4000),
});

export const draftContentSchema = z.object({
  draftId: z.string().trim().min(1),
  content: z.string().min(1, "The draft is empty.").max(100_000),
});

export const rejectSchema = z.object({
  draftId: z.string().trim().min(1),
  reason: z.string().trim().min(3, "Give a short reason for the rejection.").max(500),
});
