// 컨셉 모델 공유 링크: 설계 데이터를 URL(#c=...)에 압축 저장 → 서버 없이 고객에게 3D 모델 전달
async function deflate(str) {
  if (!('CompressionStream' in window)) return 'u' + b64url(new TextEncoder().encode(str));
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64url(new Uint8Array(await new Response(cs).arrayBuffer()));
}
async function inflate(s) {
  const mode = s[0], bytes = unb64url(s.slice(1));
  if (mode === 'u') return new TextDecoder().decode(bytes);
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(ds).text();
}
function b64url(bytes) {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodeDesign(design) { return deflate(JSON.stringify(design)); }
export async function decodeDesign(s) { return JSON.parse(await inflate(s)); }

export async function shareUrl(design) {
  const base = location.href.replace(/admin\.html.*$/, '').replace(/index\.html.*$/, '').replace(/#.*$/, '');
  return `${base}index.html#c=${await encodeDesign(design)}`;
}
