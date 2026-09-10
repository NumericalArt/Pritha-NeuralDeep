import {constants,lstatSync,realpathSync,openSync,closeSync,fstatSync,readSync} from 'node:fs';
import path from 'node:path';

/** Bounded display projection. Never used as an original, recovery snapshot or input to a paid attempt. */
export function readPrivateFilePreview(file,{root,maxBytes=16384,tail=false}={}){
  let fd;
  try{
    const limit=Math.max(1,Math.min(Number(maxBytes)||16384,2*1024*1024));
    const info=lstatSync(file),real=realpathSync(file),allowed=realpathSync(root||path.dirname(file));
    if(!info.isFile()||info.isSymbolicLink()||!real.startsWith(`${allowed}${path.sep}`))throw new Error('file_preview_identity_unverified');
    fd=openSync(real,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
    const opened=fstatSync(fd);if(opened.dev!==info.dev||opened.ino!==info.ino||!opened.isFile())throw new Error('file_preview_identity_changed');
    const start=tail?Math.max(0,opened.size-limit):0,buffer=Buffer.alloc(Math.min(opened.size,limit));
    let bytes=0;
    while(bytes<buffer.length){const count=readSync(fd,buffer,bytes,buffer.length-bytes,start+bytes);if(!count)break;bytes+=count;}
    let from=0;
    if(start>0)while(from<bytes&&(buffer[from]&0xc0)===0x80)from++;
    return {available:true,text:new TextDecoder('utf-8').decode(buffer.subarray(from,bytes),{stream:start+bytes<opened.size}),totalBytes:opened.size,truncated:opened.size>bytes,offset:start,error:null};
  }catch(error){return {available:false,text:'',totalBytes:null,truncated:false,offset:0,error:error.code==='ENOENT'?'missing':'file_preview_unavailable'};}
  finally{if(fd!==undefined)closeSync(fd);}
}
export function readPrivateJsonlTail(file,root,maxBytes=1024*1024){
  const preview=readPrivateFilePreview(file,{root,maxBytes,tail:true});
  const lines=preview.text.split(/\r?\n/);if(preview.offset>0)lines.shift();
  return lines.filter(Boolean);
}
