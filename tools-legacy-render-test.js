/* 구형 삼성 인터넷(Chromium ~71, 삼성 인터넷 10) 렌더링 시뮬레이터
   실제 구형 엔진처럼 최신 CSS 를 "무시"하도록 페이지를 변환한 뒤 저장한다.
   - clamp()/min()/max() 가 든 선언 → 삭제 (구형은 파싱 실패로 선언 무시)
   - flex 의 gap → 삭제 (grid-gap 은 유지)
   - inset: → 삭제
   - 100svh / 100dvh → 삭제
   - :focus-visible 이 든 규칙 → 삭제
   - env(...) 가 든 선언 → 삭제
   - @supports not (...) 블록 → 조건이 "미지원"이므로 내용을 그대로 펼침
   - 기능 감지 스크립트가 no-flexgap 등을 못 붙이므로 html class 를 직접 주입
*/
const fs = require("fs");
const [, , inPath, outPath] = process.argv;
let h = fs.readFileSync(inPath, "utf8");

const styleStart = h.indexOf("<style>");
const styleEnd = h.indexOf("</style>");
let css = h.slice(styleStart + 7, styleEnd);

// @supports not (...) { ... } → 내부를 펼침 (구형은 조건이 참)
function unwrapSupportsNot(src) {
  let out = "", i = 0;
  while (true) {
    const m = /@supports\s+not\s*\(/g;
    m.lastIndex = i;
    const found = m.exec(src);
    if (!found) { out += src.slice(i); break; }
    out += src.slice(i, found.index);
    // 조건 괄호 건너뛰기
    let p = found.index + found[0].length, depth = 1;
    while (p < src.length && depth > 0) { if (src[p] === "(") depth++; else if (src[p] === ")") depth--; p++; }
    while (p < src.length && src[p] !== "{") p++;
    // 블록 본문 추출
    let b = p + 1, d2 = 1;
    while (b < src.length && d2 > 0) { if (src[b] === "{") d2++; else if (src[b] === "}") d2--; b++; }
    out += src.slice(p + 1, b - 1);
    i = b;
  }
  return out;
}
css = unwrapSupportsNot(css);

// 규칙(선택자 블록) 단위로 훑으며 구형이 이해 못 하는 선언 제거
function stripLegacyDecls(src) {
  return src
    // 선언 한 줄 통째로 제거
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (!/^[-a-zA-Z]/.test(l)) return true;       // 선택자/중괄호/주석 줄은 유지
      if (!l.includes(":")) return true;
      const isDecl = /;\s*$|;\s*\/\*/.test(l) || /:\s*[^;]+$/.test(l);
      if (!isDecl) return true;
      if (/\bclamp\(|\bmin\(|\bmax\(|\benv\(/.test(l)) return false;   // 구형 미지원 함수
      if (/^inset\s*:/.test(l)) return false;
      if (/^gap\s*:|^row-gap\s*:|^column-gap\s*:/.test(l)) return false; // flex gap 미지원
      if (/100svh|100dvh/.test(l)) return false;
      if (/^text-wrap\s*:/.test(l)) return false;
      if (/^backdrop-filter\s*:/.test(l)) return false;
      if (/^overscroll-behavior\s*:/.test(l)) return false;
      return true;
    })
    .join("\n")
    // 한 줄에 여러 선언이 있는 경우(.x { display:flex; gap:.5rem; }) 개별 제거
    .replace(/(?:^|;|\{)\s*(?:gap|row-gap|column-gap|inset)\s*:[^;}]*(;)?/g, (m, semi) =>
      m.startsWith("{") ? "{" : (m.startsWith(";") ? ";" : ""))
    .replace(/[^;{}\n]*\b(?:clamp|min|max|env)\([^;}]*(;)/g, (m) =>
      /^[\s;{]*[-a-zA-Z]+\s*:/.test(m) ? ";" : m);
}
css = stripLegacyDecls(css);

// :focus-visible 이 든 규칙 전체 제거 (구형은 선택자 파싱 실패 → 규칙 무시)
css = css.replace(/[^{}]*:focus-visible[^{}]*\{[^}]*\}/g, "");

h = h.slice(0, styleStart + 7) + css + h.slice(styleEnd);

// 기능 감지가 못 붙이는 클래스를 직접 주입 (구형 상황 재현)
h = h.replace("<div class=\"stage\"", "<script>document.documentElement.className+=' no-flexgap no-focusvisible no-svh';<\/script>\n<div class=\"stage\"");

fs.writeFileSync(outPath, h, "utf8");
console.log("legacy build written:", outPath, Math.round(h.length / 1024) + "KB");
