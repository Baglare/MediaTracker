import type { ModuleVisibility, ProfileVisibility, ViewerPreviewMode } from "@/lib/social/types";

export interface VisibilityContext {
  anonymous: boolean;
  self: boolean;
  viewerFollowsOwner: boolean;
  ownerFollowsViewer: boolean;
}

export function canViewProfileDetails(mode: ProfileVisibility, context: VisibilityContext): boolean {
  if (context.self) return true;
  if (mode === "personal") return false;
  return mode === "public" || mode === "protected";
}

export function canViewModule(mode: ProfileVisibility, visibility: ModuleVisibility, context: VisibilityContext): boolean {
  if (context.self) return true;
  if (mode === "personal") return false;
  if (visibility === "public") return true;
  if (context.anonymous) return false;
  if (visibility === "followers") return context.viewerFollowsOwner;
  if (visibility === "mutual") return context.viewerFollowsOwner && context.ownerFollowsViewer;
  return false;
}

export function previewContext(mode: ViewerPreviewMode): VisibilityContext {
  switch (mode) {
    case "followers": return { anonymous: false, self: false, viewerFollowsOwner: true, ownerFollowsViewer: false };
    case "mutual": return { anonymous: false, self: false, viewerFollowsOwner: true, ownerFollowsViewer: true };
    case "self": return { anonymous: false, self: true, viewerFollowsOwner: false, ownerFollowsViewer: false };
    default: return { anonymous: true, self: false, viewerFollowsOwner: false, ownerFollowsViewer: false };
  }
}
