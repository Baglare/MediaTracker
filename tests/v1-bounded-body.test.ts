import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedBytes, readBoundedJson, readBoundedFormData } from "@/lib/api/bounded-body";
import { fetchWithTimeout, readStrictJsonObject } from "@/lib/api/request-security";
import { validateImageUpload } from "@/lib/social/validation";
import { validateMediaStateBatch } from "@/lib/xp/validation";
vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function streamed(chunks: string[], headers: Record<string,string> = {}) {
  const cancel=vi.fn();
  const body=new ReadableStream<Uint8Array>({start(c) { for(const s of chunks)c.enqueue(new TextEncoder().encode(s)); },cancel});
  return {request:new Request("https://app.invalid",{method:"POST",headers,body,duplex:"half"} as RequestInit),cancel};
}

describe("actual request byte bounds before parsing", () => {
  it.each<Record<string,string>>([{}, {"content-length":"1"}])("cancels streamed overflow with absent/misleading length %j", async headers => {
    const {request,cancel}=streamed(["1234","5"],headers);
    await expect(readBoundedBytes(request,4)).rejects.toThrow("request_too_large");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects honest oversized length without consuming; cancels body", async () => {
    const {request,cancel}=streamed(["1"],{"content-length":"5"});
    await expect(readBoundedBytes(request,4)).rejects.toThrow("request_too_large");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("accepts exact bytes including multibyte text and only consumes once", async () => {
    const request=new Request("https://app.invalid",{method:"POST",body:'"ış"'});
    expect(await readBoundedJson(request,6)).toBe("ış");
    await expect(readBoundedJson(request,6)).rejects.toThrow();
  });
  it("preserves the legitimate 1,000-item XP domain maximum including escaped Unicode", async () => {
    const payload={action:"sync_states",replace:true,items:Array.from({length:1000},(_,i)=>({
      canonicalMediaKey:`${i}:`+"ş".repeat(210),title:"ş".repeat(200),stateHash:"ş".repeat(128),
      mediaType:"tv",status:"watching",progress:100_000_000,totalProgress:100_000_000,hasRating:true,deleted:false,
    }))};
    expect(validateMediaStateBatch(payload).ok).toBe(true);
    const body=JSON.stringify(payload).replace(/ş/g,"\\u015f");
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(65_536);
    const result=await readBoundedJson(new Request("https://app.invalid",{method:"POST",body}),4_194_304);
    expect(validateMediaStateBatch(result).ok).toBe(true);
  });
  it("preserves strict sanitized overflow/malformed/fields responses", async () => {
    const make=(body:string)=>new Request("https://app.invalid",{method:"POST",body,headers:{"content-type":"application/json"}});
    for(const [body,limit,status,code] of [["{",4,400,"invalid_json"],["12345",4,413,"request_too_large"],['{"other":1}',64,400,"unknown_field"]] as const) {
      const result=await readStrictJsonObject(make(body),new Set(["query"]),limit);
      expect(result.ok).toBe(false);
      if(!result.ok) {expect(result.response.status).toBe(status);expect(await result.response.json()).toEqual({code});}
    }
  });
  it("parses valid bounded multipart without declared length and rejects malformed multipart", async () => {
    const form=new FormData();form.set("kind","avatar");form.set("file",new File([new Uint8Array(64)],"test.png",{type:"image/png"}));
    const request=new Request("https://app.invalid",{method:"POST",body:form});
    const bytes=new Uint8Array(await request.clone().arrayBuffer());
    const parsed=await readBoundedFormData(request,bytes.length);
    expect((parsed.get("file") as File).size).toBe(64);
    await expect(readBoundedFormData(new Request("https://app.invalid",{method:"POST",body:bytes,headers:request.headers}),bytes.length-1)).rejects.toThrow("request_too_large");
    await expect(readBoundedFormData(new Request("https://app.invalid",{method:"POST",body:"bad",headers:{"content-type":"multipart/form-data"}}),10)).rejects.toThrow();
  });
  it.each(["avatar","banner"] as const)("preserves %s image payload boundary", kind => {
    const max=(kind==="avatar"?5:10)*1024*1024;
    expect(validateImageUpload(kind,"image/png",max).ok).toBe(true);
    expect(validateImageUpload(kind,"image/png",max+1).ok).toBe(false);
  });
});

describe("provider deadline covers bounded response body", () => {
  it("accepts normal and exact boundary JSON", async () => {
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>new Response('{"a":1}')));
    expect(await (await fetchWithTimeout("https://api.invalid",{},100,7)).json()).toEqual({a:1});
    await expect(fetchWithTimeout("https://api.invalid",{},100,6)).rejects.toThrow("request_too_large");
  });
  it("malformed JSON still fails without dumping body", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{")));
    await expect((await fetchWithTimeout("https://api.invalid")).json()).rejects.toThrow();
  });
  it.each([429,500,503])("cancels %s error bodies without reading them", async status => {
    const cancel=vi.fn();const upstream=new Response(new ReadableStream({cancel}),{status,headers:{"retry-after":"60"}});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(upstream));
    const response=await fetchWithTimeout("https://api.invalid",{},100,1);
    expect(response.status).toBe(status);expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.text()).toBe("");expect(cancel).toHaveBeenCalledOnce();
  });
  it("times out slow headers", async () => {
    vi.stubGlobal("fetch",vi.fn().mockImplementation((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("aborted"))))));
    await expect(fetchWithTimeout("https://api.invalid",{},10)).rejects.toThrow("aborted");
  });
  it.each([false,true])("times out headers-fast body that never completes (partial=%s)", async partial => {
    const cancel=vi.fn();const body=new ReadableStream<Uint8Array>({start(c){if(partial)c.enqueue(new TextEncoder().encode("{"));},cancel});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchWithTimeout("https://api.invalid",{},10)).rejects.toThrow("body_aborted");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("honors abort during body and already aborted caller", async () => {
    const controller=new AbortController();
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>{queueMicrotask(()=>controller.abort());return new Response(new ReadableStream());}));
    await expect(fetchWithTimeout("https://api.invalid",{signal:controller.signal})).rejects.toThrow("body_aborted");
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async(_url,{signal})=>{expect(signal.aborted).toBe(true);throw new Error("aborted");}));
    await expect(fetchWithTimeout("https://api.invalid",{signal:controller.signal})).rejects.toThrow("aborted");
  });
});
