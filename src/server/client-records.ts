import "server-only";
import { applyContradictions, type Contradiction, type FactCheckResult } from "@/lib/domain/citations";
import { AppError, publicErrorText } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireGroq } from "@/server/embeddings";
import { getActorOrganization } from "@/server/scope";

export async function listClientRecords() {
  const organization = await getActorOrganization();
  return prisma.clientRecord.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function addClientRecord(input: { title: string; body: string }) {
  const organization = await getActorOrganization();
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) throw new AppError("Give the record a title.", 400, "VALIDATION");
  if (body.length < 40) throw new AppError("The client record is too short to check against.", 400, "VALIDATION");
  return prisma.clientRecord.create({
    data: { organizationId: organization.id, title, body },
  });
}

export async function findContradictions(organizationId: string, draft: string): Promise<Contradiction[]> {
  const records = await prisma.clientRecord.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (records.length === 0) return [];
  const packet = records
    .map((record) => `Record: ${record.title}\n${record.body}`)
    .join("\n\n")
    .slice(0, 12_000);
  const client = requireGroq();
  const model = process.env.GROQ_CHAT_MODEL?.trim() || "openai/gpt-oss-120b";
  let text = "";
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Compare a grant draft to client records. Return JSON only: {\"contradictions\":[{\"claim\":\"...\",\"recordExcerpt\":\"...\",\"reason\":\"...\"}]}. Include a contradiction only when the draft states a fact the records deny. Do not flag omissions. If there are none, return {\"contradictions\":[]}.",
        },
        {
          role: "user",
          content: `Client records:\n${packet}\n\nDraft:\n${draft.slice(0, 12_000)}`,
        },
      ],
    });
    text = completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    const message = error instanceof Error ? publicErrorText(error.message) : "Record check failed.";
    throw new AppError(message || "Record check failed.", 502, "GROQ");
  }
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) return [];
  try {
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      contradictions?: Contradiction[];
    };
    return (parsed.contradictions ?? []).filter(
      (item) => item.claim && item.recordExcerpt && item.reason,
    );
  } catch {
    return [];
  }
}

export async function withRecordCheck(
  organizationId: string,
  draft: string,
  fact: FactCheckResult,
): Promise<FactCheckResult> {
  const contradictions = await findContradictions(organizationId, draft);
  return applyContradictions(fact, contradictions);
}
