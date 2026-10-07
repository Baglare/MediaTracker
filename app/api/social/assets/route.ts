import { readBoundedFormData } from "@/lib/api/bounded-body";
import { checkAccountWriteAllowed, accountWriteLockedResponse } from "@/lib/api/account-write-barrier";
import { enforceDistributedRateLimit } from "@/lib/api/distributed-rate-limit";
import { runSafeApiRoute } from "@/lib/api/safe-route";
import { validateAuthenticatedMutationRequest } from "@/lib/api/request-security";
import { NextResponse } from "next/server";

import { validateImageUpload } from "@/lib/social/validation";
import { getApplicationServerClient as getSupabaseServerClient } from "@/lib/backend/application-server";
import { createSignedSocialAssetUrl, invalidateSignedSocialAssetUrl } from "@/lib/social/server";
import { getBackendProvider } from '@/lib/backend/provider';
import { replaceNativeAsset } from '@/lib/backend/filesystem-assets';

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function authContext() {
  const client = await getSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ? { client, user: data.user } : null;
}

export async function POST(request: Request) {
  return runSafeApiRoute("/api/social/assets", "POST", async () => {
  const auth = await authContext();
  if (!auth) return NextResponse.json({ ok: false, message: "Bu işlem için giriş yapmalısın." }, { status: 401 });
  const boundaryError = validateAuthenticatedMutationRequest(request);
  if (boundaryError) return boundaryError;
  const accountBarrier = await checkAccountWriteAllowed();
  if (accountBarrier) return accountBarrier;
  const rateLimit = await enforceDistributedRateLimit(request, "asset_write");
  if (rateLimit) return rateLimit;
  let form: FormData;
  try { form = await readBoundedFormData(request, 10 * 1024 * 1024 + 65_536); } catch { return NextResponse.json({ ok: false, message: "Dosya isteği geçersiz." }, { status: 400 }); }
  const kindValue = form.get("kind");
  const fileValue = form.get("file");
  const kind = kindValue === "avatar" || kindValue === "banner" ? kindValue : null;
  if (!kind || !(fileValue instanceof File)) return NextResponse.json({ ok: false, message: "Dosya isteği geçersiz." }, { status: 400 });
  const validation = validateImageUpload(kind, fileValue.type, fileValue.size);
  if (!validation.ok) return NextResponse.json({ ok: false, message: validation.error }, { status: 400 });
  if(getBackendProvider()==='native') {
    try{return NextResponse.json(await replaceNativeAsset(kind,fileValue));}
    catch(error){return accountWriteLockedResponse(error)??NextResponse.json({ok:false,message:'Görsel yüklenemedi; mevcut görsel korunuyor.'},{status:409});}
  }
  const { data: current } = await auth.client.from("profiles").select("avatar_path,banner_path").eq("id", auth.user.id).maybeSingle();
  if (!current) return NextResponse.json({ ok: false, message: "Önce sosyal profili kaydet." }, { status: 409 });
  const oldPath = kind === "avatar" ? current?.avatar_path ?? null : current?.banner_path ?? null;
  const path = `${auth.user.id}/${kind}/${crypto.randomUUID()}.${EXTENSIONS[fileValue.type]}`;
  const { error: uploadError } = await auth.client.storage.from("profile-assets").upload(path, fileValue, { contentType: fileValue.type, upsert: false });
  if (uploadError) { const locked = accountWriteLockedResponse(uploadError); if (locked) return locked; }
  if (uploadError) return NextResponse.json({ ok: false, message: "Görsel yüklenemedi; mevcut görsel korunuyor." }, { status: 500 });
  const { error: updateError } = await auth.client.from("profiles").update(kind === "avatar" ? { avatar_path: path } : { banner_path: path }).eq("id", auth.user.id);
  if (updateError) { const locked = accountWriteLockedResponse(updateError); if (locked) return locked; }
  if (updateError) {
    await auth.client.storage.from("profile-assets").remove([path]);
    return NextResponse.json({ ok: false, message: "Profil görseli güncellenemedi; mevcut görsel korunuyor." }, { status: 500 });
  }
  const cleanup = oldPath ? await auth.client.storage.from("profile-assets").remove([oldPath]) : null;
  invalidateSignedSocialAssetUrl(oldPath);
  const signedUrl = await createSignedSocialAssetUrl(path, kind, path);
  return NextResponse.json({ ok: true, url: signedUrl, cleanupPending: Boolean(cleanup?.error) });

  });
}

export async function DELETE(request: Request) {
  return runSafeApiRoute("/api/social/assets", "DELETE", async () => {
  const auth = await authContext();
  if (!auth) return NextResponse.json({ ok: false, message: "Bu işlem için giriş yapmalısın." }, { status: 401 });
  const boundaryError = validateAuthenticatedMutationRequest(request);
  if (boundaryError) return boundaryError;
  const accountBarrier = await checkAccountWriteAllowed();
  if (accountBarrier) return accountBarrier;
  const rateLimit = await enforceDistributedRateLimit(request, "asset_write");
  if (rateLimit) return rateLimit;
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "avatar" && kind !== "banner") return NextResponse.json({ ok: false, message: "Görsel türü geçersiz." }, { status: 400 });
  if(getBackendProvider()==='native') {
    try{return NextResponse.json(await replaceNativeAsset(kind,null));}
    catch(error){return accountWriteLockedResponse(error)??NextResponse.json({ok:false,message:'Görsel kaldırılamadı.'},{status:409});}
  }
  const { data } = await auth.client.from("profiles").select("avatar_path,banner_path").eq("id", auth.user.id).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, message: "Sosyal profil bulunamadı." }, { status: 404 });
  const path = kind === "avatar" ? data?.avatar_path ?? null : data?.banner_path ?? null;
  const { error } = await auth.client.from("profiles").update(kind === "avatar" ? { avatar_path: null } : { banner_path: null }).eq("id", auth.user.id);
  if (error) { const locked = accountWriteLockedResponse(error); if (locked) return locked; }
  if (error) return NextResponse.json({ ok: false, message: "Görsel kaldırılamadı." }, { status: 500 });
  const cleanup = path ? await auth.client.storage.from("profile-assets").remove([path]) : null;
  invalidateSignedSocialAssetUrl(path);
  return NextResponse.json({ ok: true, cleanupPending: Boolean(cleanup?.error) });

  });
}
