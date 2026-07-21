import type { RecommendationEventType, SocialEntityActor, SocialRecommendation, SocialRecommendationEvent } from "@/lib/social/interactions";
import { RECOMMENDATION_EVENT_TYPES } from "@/lib/social/interactions";
import { socialRecord, validateRecommendationProgressStatus, validateRecommendationResponseStatus, validateSocialMediaSnapshot, validateUuid } from "@/lib/social/interactions-validation";

type AvatarResolver = (path: unknown) => Promise<string | undefined>;
export type RecommendationParseResult = { ok: true; value: SocialRecommendation } | { ok: false; reason: string };

function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function dateValue(value: unknown): string | undefined { const text = stringValue(value); return text && !Number.isNaN(Date.parse(text)) ? text : undefined; }

export function parseRecommendationEvent(value: unknown): SocialRecommendationEvent | undefined {
  const record = socialRecord(value); const id = validateUuid(record?.id); const createdAt = dateValue(record?.createdAt); const actor = record?.actorId ? validateUuid(record.actorId) : null; const eventType = record?.eventType;
  if (!record || !id.ok || !createdAt || typeof eventType !== "string" || !RECOMMENDATION_EVENT_TYPES.includes(eventType as RecommendationEventType) || (actor && !actor.ok)) return undefined;
  return { id: id.value, eventType: eventType as RecommendationEventType, actorId: actor?.ok ? actor.value : undefined, createdAt };
}

async function parseOther(value: unknown, resolveAvatar: AvatarResolver): Promise<SocialEntityActor | undefined> {
  const record = socialRecord(value); const id = validateUuid(record?.id); const displayName = stringValue(record?.displayName);
  if (!record || !id.ok || !displayName) return undefined;
  return { id: id.value, username: stringValue(record.username), displayName, avatarUrl: await resolveAvatar(record.avatarPath) };
}

export async function parseSocialRecommendation(value: unknown, resolveAvatar: AvatarResolver): Promise<RecommendationParseResult> {
  const record = socialRecord(value);
  if (!record) return { ok: false, reason: "not_an_object" };
  const id = validateUuid(record.id); const sender = validateUuid(record.senderId); const recipient = validateUuid(record.recipientId);
  const response = validateRecommendationResponseStatus(record.responseStatus); const progress = validateRecommendationProgressStatus(record.progressStatus);
  const media = validateSocialMediaSnapshot(record.media); const other = await parseOther(record.other, resolveAvatar); const createdAt = dateValue(record.createdAt);
  if (!id.ok || !sender.ok || !recipient.ok || !response.ok || !progress.ok || !media.ok || !other || !createdAt) return { ok: false, reason: "invalid_core_fields" };

  const preview = socialRecord(record.lastMessagePreview); const previewAuthor = preview?.authorId ? validateUuid(preview.authorId) : null; const previewCreatedAt = dateValue(preview?.createdAt);
  const unreadMessageCount = Math.max(0, Math.trunc(numberValue(record.unreadMessageCount) ?? 0));
  return { ok: true, value: {
    id: id.value, senderId: sender.value, recipientId: recipient.value, responseStatus: response.value, progressStatus: progress.value,
    senderNote: stringValue(record.senderNote), recipientResponseNote: stringValue(record.recipientResponseNote), media: media.value,
    canonicalMediaKey: stringValue(record.canonicalMediaKey) ?? media.value.canonicalKey, alreadyInLibrary: record.alreadyInLibrary === true,
    createdAt, updatedAt: dateValue(record.updatedAt), respondedAt: dateValue(record.respondedAt), startedAt: dateValue(record.startedAt), completedAt: dateValue(record.completedAt), withdrawnAt: dateValue(record.withdrawnAt),
    lastEvent: parseRecommendationEvent(record.lastEvent),
    lastMessagePreview: preview && previewAuthor?.ok && previewCreatedAt ? { body: stringValue(preview.body), authorId: previewAuthor.value, createdAt: previewCreatedAt } : undefined,
    unreadMessageCount, other,
  } };
}
