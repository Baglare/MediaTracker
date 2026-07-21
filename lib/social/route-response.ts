import "server-only";

const SAFE_ERRORS:Record<string,{status:number;message:string}>={
  authentication_required:{status:401,message:"Bu işlem için giriş yapmalısın."},social_not_configured:{status:503,message:"Sosyal sistem yapılandırılmamış."},social_profile_required:{status:409,message:"Önce sosyal profilini oluşturmalısın."},profile_unavailable:{status:404,message:"Profil kullanılamıyor."},activity_unavailable:{status:404,message:"Aktivite kullanılamıyor."},activity_not_found:{status:404,message:"Aktivite kullanılamıyor."},comment_not_found:{status:404,message:"Yorum kullanılamıyor."},parent_comment_unavailable:{status:404,message:"Yanıtlanacak yorum kullanılamıyor."},target_unavailable:{status:404,message:"İçerik kullanılamıyor."},recommendation_unavailable:{status:404,message:"Öneri kullanılamıyor."},recommendation_not_found:{status:404,message:"Öneri kullanılamıyor."},recommendation_not_allowed:{status:403,message:"Bu kullanıcı şu anda öneri kabul etmiyor."},self_recommendation_not_allowed:{status:400,message:"Kendine medya önerisi gönderemezsin."},not_allowed:{status:403,message:"Bu işlem için yetkin yok."},invalid_transition:{status:409,message:"Bu öneri için geçiş artık geçerli değil."},duplicate_recommendation:{status:409,message:"Bu medya için zaten açık bir öneri var."},recipient_open_limit:{status:429,message:"Bu kullanıcıya açık öneri sınırına ulaştın."},rate_limit:{status:429,message:"İşlem sınırına ulaştın; daha sonra tekrar dene."},duplicate_comment:{status:409,message:"Aynı yorumu kısa süre içinde tekrar gönderemezsin."},already_reported:{status:409,message:"Bu içeriği daha önce raporladın."},invalid_filter:{status:400,message:"Filtre geçersiz."},invalid_target:{status:400,message:"Hedef geçersiz."},invalid_comment:{status:400,message:"Yorum geçersiz."},invalid_reaction:{status:400,message:"Tepki geçersiz."},invalid_report:{status:400,message:"Rapor verisi geçersiz."}
};

export const PRIVATE_NO_STORE_HEADERS={"Cache-Control":"private, no-store, max-age=0"};

export function safeSocialRouteError(error:unknown):Response{
  const raw=error instanceof Error?error.message:"";const key=Object.keys(SAFE_ERRORS).find((entry)=>raw.includes(entry));const safe=key?SAFE_ERRORS[key]:{status:500,message:"Sosyal işlem tamamlanamadı."};
  return Response.json({message:safe.message},{status:safe.status,headers:PRIVATE_NO_STORE_HEADERS});
}

export async function readJsonBody(request:Request):Promise<unknown>{
  try{return await request.json();}catch{return null;}
}
