// Selection policy 3. Keep exact contiguous source text; rank substantive
// paragraphs before applying either the byte limit or the passage count limit.
const genericTerms=new Set(['current','official','documentation','docs','selected','primary','agent','requires','declared']);
const links=/\[[^\]]*\]\([^)]*\)/g;

function substantive(text) {
 const prose=text.replace(links,'').replace(/https?:\/\/\S+/g,'').replace(/<!--[^]*?-->/g,'');
 const letters=(prose.match(/\p{L}/gu)||[]).length;
 return letters>=40 && letters/(text.match(/\p{L}/gu)||[]).length>=0.35 && !/^#{1,6} [^\n]+$/.test(text);
}

function chunks(text) {
 const result=[];
 for(let paragraph of text.split(/\r?\n[\t ]*\r?\n/)) {
  paragraph=paragraph.trim();
  // Filter whole navigation blocks before splitting: a cut in the middle of a
  // Markdown link would otherwise turn its URL tail into apparent prose.
  if(!substantive(paragraph))continue;
  while(paragraph) {
   let prefix='',bytes=0;
   for(const character of paragraph) {
    const size=Buffer.byteLength(character);if(bytes+size>1000)break;
    prefix+=character;bytes+=size;
   }
   let cut=prefix.length;
   if(cut<paragraph.length) {
    const boundary=Math.max(prefix.lastIndexOf('\n'),prefix.lastIndexOf(' '));
    if(boundary>cut/2)cut=boundary;
   }
   result.push(paragraph.slice(0,cut).trim());paragraph=paragraph.slice(cut).trimStart();
  }
 }
 return result;
}

export function rankedSourceQuotes(text,query) {
 const terms=[...new Set(String(query||'').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[])].filter(term=>!genericTerms.has(term));
 const seen=new Set(),candidates=[];
 for(const [index,quote] of chunks(String(text)).entries()) {
  if(quote.length<40 || seen.has(quote))continue;
  seen.add(quote);
  // Link menus often repeat every query word in their URLs. A menu is not
  // evidence; require prose outside links, and never score URL destinations.
  if(!substantive(quote))continue;
  const visible=quote.replace(links,match=>match.slice(1,match.indexOf(']'))).replace(/https?:\/\/\S+/g,'').toLowerCase();
  const words=new Set(visible.match(/[\p{L}\p{N}]+/gu)||[]);
  candidates.push({quote,index,terms:terms.filter(term=>words.has(term)||words.has(term+'s'))});
 }
 const frequency=new Map(terms.map(term=>[term,candidates.filter(item=>item.terms.includes(term)).length]));
 const weight=term=>1+Math.log2((candidates.length+1)/(frequency.get(term)+1));
 const remaining=candidates.filter(item=>item.terms.length),chosen=[],covered=new Set();let bytes=0;
 while(remaining.length && chosen.length<8) {
  // Cover distinct requested facts before spending the cap on near-identical
  // options (for example, title/redirect/category variants of one snippet).
  const score=item=>item.terms.reduce((total,term)=>total+weight(term)*(covered.has(term)?0.1:1),0);
  remaining.sort((a,b)=>score(b)-score(a)||a.index-b.index);
  const item=remaining.shift(),size=Buffer.byteLength(item.quote);
  if(bytes+size<=2400){chosen.push(item);bytes+=size;for(const term of item.terms)covered.add(term);}
 }
 return chosen.sort((a,b)=>a.index-b.index).map(item=>item.quote);
}
