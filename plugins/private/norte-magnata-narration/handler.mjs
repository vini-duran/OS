import { writeFile, readFile } from "node:fs/promises";
import { execFile as exec } from "node:child_process";
import { promisify } from "node:util";
const execFile=promisify(exec), API="https://api.openai.com/v1";
const text=(v)=>typeof v==="string"?v.trim():"";
const fail=(code,message,retryable=false)=>({status:"error",code,message,retryable});
const artifact=(id,name,mimeType,size)=>({id,name,mimeType,size,url:`artifact://${id}`});
const declare=(id,name,mimeType,size)=>({id,name,mimeType,size,source:{kind:"path",path:name}});
async function duration(path){const {stdout}=await execFile("/usr/bin/afinfo",[path]);const n=Number(String(stdout).match(/estimated duration:\s*([\d.]+)/i)?.[1]);if(!Number.isFinite(n)||n<=0)throw Error("Duração do MP3 inválida.");return n;}
async function post(path,key,body,signal){return fetch(`${API}${path}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,...(body instanceof FormData?{}:{"Content-Type":"application/json"})},body:body instanceof FormData?body:JSON.stringify(body),signal});}
export async function execute(request,services){
 if(request.invocation?.mode!=="start")return fail("INVALID_INVOCATION","Capacidade imediata.");
 const script=text(request.inputs?.script);if(!script)return fail("INVALID_INPUT","O roteiro aprovado é obrigatório.");
 const audioName="narracao.mp3",srtName="narracao.srt";
 if(request.configuration?.simulate===true){await writeFile(services.getOutputPath(audioName),Buffer.from([0]));await writeFile(services.getOutputPath(srtName),"1\n00:00:00,000 --> 00:00:01,000\nSimulação técnica.\n");return {status:"success",values:{audio:artifact("narration-audio",audioName,"audio/mpeg",1),srt:artifact("narration-srt",srtName,"application/x-subrip",54),narration_report:"Simulação técnica sem chamadas OpenAI."},artifacts:[declare("narration-audio",audioName,"audio/mpeg",1),declare("narration-srt",srtName,"application/x-subrip",54)]};}
 const key=text(await services.getSecret("OPENAI_API_KEY"));if(!key)return fail("OPENAI_API_KEY_REQUIRED","Conecte OPENAI_API_KEY ao plugin de Narração.");
 const voice=["onyx","echo","fable","alloy","nova","shimmer"].includes(request.configuration?.voice)?request.configuration.voice:"onyx";const speed=Number(request.configuration?.speed??.94);
 let res;try{res=await post("/audio/speech",key,{model:"gpt-4o-mini-tts",voice,input:script,instructions:"Português brasileiro. Voz masculina adulta, firme, sóbria, natural e sem tom publicitário. Pausas curtas em viradas; não dramatizar.",response_format:"mp3",speed:Number.isFinite(speed)?speed:.94},services.signal);}catch(e){return fail("OPENAI_UNAVAILABLE",e instanceof Error?e.message:"Voz indisponível.",true)}
 if(!res.ok){const b=await res.json().catch(()=>({}));return fail(`OPENAI_HTTP_${res.status}`,text(b?.error?.message)||"A voz não foi gerada.",res.status===429||res.status>=500)}
 const bytes=Buffer.from(await res.arrayBuffer());if(!bytes.length)return fail("AUDIO_EMPTY","A voz retornou vazia.",true);const audioPath=services.getOutputPath(audioName);await writeFile(audioPath,bytes);
 let seconds;try{seconds=await duration(audioPath)}catch(e){return fail("AUDIO_INVALID",e instanceof Error?e.message:"MP3 inválido.",false)}
 const form=new FormData();form.append("file",new File([await readFile(audioPath)],audioName,{type:"audio/mpeg"}));form.append("model","whisper-1");form.append("language","pt");form.append("response_format","srt");
 try{res=await post("/audio/transcriptions",key,form,services.signal)}catch(e){return fail("OPENAI_UNAVAILABLE",e instanceof Error?e.message:"Transcrição indisponível.",true)}
 if(!res.ok){const b=await res.json().catch(()=>({}));return fail(`OPENAI_HTTP_${res.status}`,text(b?.error?.message)||"O SRT não foi produzido.",res.status===429||res.status>=500)}
 const srt=await res.text();if(!/-->/.test(srt))return fail("SRT_INVALID","A transcrição não retornou timestamps reais.",true);const srtBytes=Buffer.byteLength(srt);await writeFile(services.getOutputPath(srtName),srt,"utf8");
 return {status:"success",values:{audio:artifact("narration-audio",audioName,"audio/mpeg",bytes.length),srt:artifact("narration-srt",srtName,"application/x-subrip",srtBytes),narration_report:`Voz ${voice}; ${seconds.toFixed(1)}s; SRT transcrito do próprio MP3.`},artifacts:[declare("narration-audio",audioName,"audio/mpeg",bytes.length),declare("narration-srt",srtName,"application/x-subrip",srtBytes)],usage:{provider:"OpenAI Audio API",unit:"requests",inputUnits:2,totalUnits:2}};
}
