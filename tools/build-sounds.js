/* assets/sounds/*.mp3 → js/sounds.js
 * 다운로드한 게임 HTML 하나만으로 소리가 나야 하고, Claude Artifact는 외부 파일을 못 불러와서
 * 소리를 글자(base64 data URI)로 바꿔 스크립트 안에 넣습니다.
 *   node tools/build-sounds.js
 */
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "assets", "sounds");
const out = path.join(__dirname, "..", "js", "sounds.js");

const files = fs.readdirSync(dir).filter(f => f.endsWith(".mp3")).sort();
const lines = files.map(f => {
  const b64 = fs.readFileSync(path.join(dir, f)).toString("base64");
  return `  ${JSON.stringify(path.basename(f, ".mp3"))}: "data:audio/mpeg;base64,${b64}"`;
});
fs.writeFileSync(out,
`/* 토큰 변환기 담당: 효과음 (자동 생성 파일, 직접 고치지 마세요)
 * 원본과 출처: assets/sounds/ , CREDITS.md
 * 다시 만들기: node tools/build-sounds.js
 */
window.SOUNDS = {
${lines.join(",\n")}
};
`);
console.log(`${files.length} sounds → ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size/1024)} KB)`);
