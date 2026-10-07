import 'server-only';
import { getCurrentUser } from '../auth/current-user';
import { supabaseApplicationError } from '../supabase/safe-error';
import { domainOperations } from './domain-operations';
import { requireAuthenticatedTransaction, withAuthenticatedTransaction, withReadTransaction, type AuthenticatedTransaction } from './transaction';

const tables = {
  profiles: { owner:'id', columns:'id username display_name tagline bio location language visibility_mode connection_color avatar_path banner_path selected_title profile_palette_id banner_mode banner_position overlay_strength avatar_frame surface_style motif_intensity banner_focal_x banner_focal_y banner_zoom avatar_focal_x avatar_focal_y avatar_zoom profile_theme_visibility public_theme_preset username_changed_at deleted_at recommendation_permission', conflict:'id', write:false },
  profile_modules: { owner:'user_id', columns:'user_id module_key enabled visibility grid_x grid_y grid_width grid_height mobile_order config', conflict:'user_id,module_key', write:true },
  profile_media_showcase: { owner:'user_id', columns:'showcase_kind title media_type external_source external_id cover_url world sort_order', conflict:'', write:false },
  profile_shared_notes: { owner:'user_id', columns:'id media_title media_type external_source external_id content contains_spoiler visibility created_at updated_at', conflict:'', write:false },
  profile_stats_snapshots: { owner:'user_id', columns:'user_id total_media completed active planning favorites rated world_counts snapshot_at', conflict:'user_id', write:true },
  profile_progression_snapshots: { owner:'user_id', columns:'user_id version total_xp level title tier dominant_world progress_percent world_counts snapshot_at', conflict:'user_id', write:true },
  social_activity_preferences: { owner:'user_id', columns:'share_completed share_started share_rating share_favorite share_recommendation_completed default_visibility', conflict:'', write:false },
  social_notification_preferences: { owner:'user_id', columns:'follow_notifications comment_notifications reaction_notifications recommendation_received recommendation_accepted recommendation_started recommendation_completed recommendation_rejected recommendation_withdrawn', conflict:'', write:false },
} as const;
type Result = { data: unknown; error: Error | null };
export async function executeNativeDomainOperation(tx: AuthenticatedTransaction, name: string, args: Record<string, unknown> = {}) {
  requireAuthenticatedTransaction(tx);
  if (!Object.hasOwn(domainOperations,name)) throw new Error('operation_denied');
  const fields = domainOperations[name as keyof typeof domainOperations] as readonly (readonly [string,string,boolean])[];
  if (Object.keys(args).some(k => !fields.some(([field])=>field===k)) || fields.some(([field,,optional])=>!optional && args[field]===undefined)) throw new Error('operation_invalid');
  // p_viewer is never caller authority. The SQL default uses transaction identity.
  if(Object.hasOwn(args,'p_viewer')) throw new Error('operation_denied');
  const selected=fields.filter(([field])=>args[field]!==undefined && field!=='p_viewer');
  const values=selected.map(([field,type])=>type==='jsonb' && args[field]!==null ? JSON.stringify(args[field]) : args[field]);
  const result=await tx.query(`SELECT app.${name}(${selected.map(([field,type],i)=>`${field} => $${i+1}::${type}`).join(',')}) AS result`,values);
  return result.rows[0]?.result;
}
class NativeQuery implements PromiseLike<Result> {
  private columns: string[] = [];
  private filters: { column:string; value:unknown; nullOnly:boolean }[] = [];
  private sorting?: {column:string; ascending:boolean};
  private single=false;
  private rows?: Record<string,unknown>[];
  private conflict?: string;
  constructor(private table: keyof typeof tables) {}
  private column(value:string) {
    if(![tables[this.table].owner,...tables[this.table].columns.split(' ')].includes(value)) throw new Error('operation_invalid');
    return value;
  }
  select(columns:string) { this.columns=columns.split(',').map(c=>this.column(c)); return this; }
  eq(column:string,value:unknown) {this.filters.push({column:this.column(column),value,nullOnly:false});return this;}
  is(column:string,value:unknown) {if(value!==null)throw new Error('operation_invalid');this.filters.push({column:this.column(column),value:null,nullOnly:true});return this;}
  order(column:string,options?:{ascending?:boolean}) {this.sorting={column:this.column(column),ascending:options?.ascending!==false};return this;}
  maybeSingle() {this.single=true;return this;}
  upsert(value:Record<string,unknown>|Record<string,unknown>[],options?:{onConflict?:string}) {
    const contract=tables[this.table];
    if(!contract.write || (options?.onConflict && options.onConflict!==contract.conflict))throw new Error('operation_denied');
    this.rows=Array.isArray(value)?value:[value];this.conflict=contract.conflict;return this;
  }
  async execute():Promise<Result> {
    try {
      const data=await withAuthenticatedTransaction(async tx=>{
        const contract=tables[this.table];
        if(this.rows) {
          if(!this.rows.length || this.rows.length>32)throw new Error('operation_invalid');
          for(const row of this.rows) {
            if(row[contract.owner]!==tx.userId)throw new Error('owner_context_changed');
            const keys=Object.keys(row).map(k=>this.column(k));
            const values=keys.map(k=>['config','world_counts'].includes(k)?JSON.stringify(row[k]):row[k]);
            const update=keys.filter(k=>!this.conflict!.split(',').includes(k));
            if(!update.length)throw new Error('operation_invalid');
            await tx.query(`INSERT INTO app.${this.table} (${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT(${this.conflict}) DO UPDATE SET ${update.map(k=>`${k}=EXCLUDED.${k}`).join(',')}`,values);
          }
          return null;
        }
        if(!this.columns.length || !this.filters.some(f=>f.column===contract.owner && f.value===tx.userId && !f.nullOnly))throw new Error('owner_context_changed');
        const values:unknown[]=[];
        const where=this.filters.map(f=>f.nullOnly?`${f.column} IS NULL`:`${f.column}=$${values.push(f.value)}`);
        const result=await tx.query(`SELECT ${this.columns.join(',')} FROM app.${this.table} WHERE ${where.join(' AND ')}${this.sorting?` ORDER BY ${this.sorting.column} ${this.sorting.ascending?'ASC':'DESC'}`:''} LIMIT ${this.single?2:10001}`,values);
        if(result.rows.length>(this.single?1:10000))throw new Error('domain_capacity_exceeded');
        return this.single ? result.rows[0]??null : result.rows;
      });
      return {data,error:null};
    } catch(error) {return {data:null,error:supabaseApplicationError(error)};}
  }
  then<TResult1 = Result, TResult2 = never>(fulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null):PromiseLike<TResult1|TResult2> {
    return this.execute().then(fulfilled,rejected);
  }
}
export function createNativeDomainClient() {
  return {
    auth: {getUser:async()=>({data:{user:await getCurrentUser()},error:null})},
    rpc:async(name:string,args:Record<string,unknown>={}) => {
      try{return {data:await withReadTransaction(tx=>executeNativeDomainOperation(tx,name,args)),error:null};}
      catch(error){return {data:null,error:supabaseApplicationError(error)};}
    },
    from:(table:string)=>{
      if(!Object.hasOwn(tables,table))throw new Error('operation_denied');
      return new NativeQuery(table as keyof typeof tables);
    },
    storage:{from:(bucket:string)=>{
      if(bucket!=='profile-assets')throw new Error('operation_denied');
      return {createSignedUrl:async(path:string)=>{
        try {
          const { nativeAssetUrl }=await import('./filesystem-assets');
          return {data:{signedUrl:await nativeAssetUrl(path)},error:null};
        } catch(error){return {data:null,error:supabaseApplicationError(error)};}
      }};
    }},
  };
}
