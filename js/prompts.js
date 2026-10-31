// =============================================================
//  AI 도우미 프롬프트 생성기 (API 미사용)
//  관리자가 아래 프롬프트를 복사 → Claude.ai / ChatGPT 유료 구독 채팅창에 붙여넣기
//  (스케치 이미지·PDF는 채팅창에 직접 첨부) → 답변(JSON)을 관리자 페이지에 다시 붙여넣어 적용.
// =============================================================
import { TEMPLATES } from './templates.js';
import { MATERIALS, PROCESSES } from './kb.js';
import { bomRows } from './estimator.js';

function templateCatalog() {
  return Object.values(TEMPLATES).map((t) => `- "${t.key}" (${t.name}): ` + t.params.map((p) => p.type === 'select' ? `${p.key}∈{${p.options.join('|')}}` : `${p.key}[${p.unit}, ${p.min}~${p.max}]`).join(', ')).join('\n');
}

const PART_SCHEMA = `{
  "id": "영문 고유ID", "pn": "같은 도면을 쓰는 부품끼리 같은 값", "name": "한글 부품명",
  "shape": "box" | "cyl",
  "size": [X, Y, Z]            // box 일 때 (mm)
  "d": 지름, "len": 길이, "axis": "x"|"y"|"z"   // cyl 일 때
  "pos": [x, y, z]             // 부품 '중심' 좌표 (mm, Z-up, 바닥 중앙이 원점, 정면은 -Y 방향)
  "mat": "${Object.keys(MATERIALS).join('|')}",
  "proc": "${Object.keys(PROCESSES).join('|')}",
  "std": true/false, "spec": "구매품 규격", "price": [저가, 표준, 고가] (원, 구매품만),
  "holes": [{"x":..,"y":..,"d":..}]   // 상면(Z) 관통 구멍, 부품 중심 기준 (선택)
  "motion": [ {"kind":"kf","axis":[0,0,1],"keys":[[0,0],[0.4,300],[0.5,300],[0.9,0],[1,0]]} ],  // 직선 운동 (t: 0~1 주기 비율, 값 mm)
            // 회전: {"kind":"rot","axis":"z","center":[x,y],"keys":[[0,0],[1,360]]} (값: 도)
  "follow": "따라 움직일 부품 id (선택)", "ignore": ["접촉이 정상인 부품 id/pn"], "role": "work (이송물/작업물일 때)"
}`;

export function buildPrompt(kind, project, extra = {}) {
  const r = project?.request || {}, c = project?.customer || {};
  const reqText = `[의뢰 제목] ${r.title || project?.title || ''}
[의뢰 내용]
${r.text || '(없음)'}
[고객 답변] ${Object.entries(r.answers || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / ') || '(없음)'}
[수량] ${r.qty || 1}  [희망 납기] ${r.deadline || '-'}  [기타] ${r.etc || '-'}
[현재 설계안] ${JSON.stringify(project?.design || {})}`;

  switch (kind) {
    case 'analyze': return `당신은 20년 경력의 한국 기계설계/자동화 장비 설계 엔지니어입니다.
아래 고객 의뢰를 분석해서 (1) 설계·제작에 필요한 누락 정보를 질문으로, (2) 기술적 제안을, (3) 적합한 설계 템플릿과 파라미터를 JSON으로 제시하세요.
첨부 이미지/PDF(손그림, 참고도면)가 있으면 형상·치수·주기를 읽어서 반영하세요.

${reqText}

[사용 가능한 템플릿과 파라미터]
${templateCatalog()}

템플릿으로 표현하기 어려우면 "type":"custom" 과 "parts" 배열을 사용하세요. (부품 스키마는 아래)
${PART_SCHEMA}

[출력 형식] 설명은 짧게 하고, 마지막에 반드시 아래 형식의 JSON 코드블록 하나를 출력:
\`\`\`json
{
  "type": "템플릿 key 또는 custom",
  "title": "제품명",
  "params": { "파라미터": 값 },
  "parts": [],            // custom 일 때만
  "period": 4,            // custom 이고 움직이는 경우 1주기(초)
  "questions": ["고객에게 물어볼 질문", "..."],
  "suggestions": ["설계 제안", "..."],
  "risks": ["기술적 리스크", "..."]
}
\`\`\``;

    case 'sketch': return `첨부한 손그림/스케치/도면 이미지를 분석해서 3D 컨셉 모델을 만들 부품 목록을 JSON으로 작성해 주세요.
- 단위 mm, Z-up 좌표, 바닥 중앙이 원점, 정면은 -Y 방향.
- 스케치에 적힌 치수를 우선 사용하고, 없는 치수는 일반적인 설계 관례로 합리적으로 추정 후 "assumptions"에 기록.
- 프레임·플레이트·축·모터 등 주요 부품 단위로 10~40개 정도로 분해.
- 움직이는 장치면 motion 으로 작동을 정의하고, 부품끼리 실제로 겹치지 않게 배치(정상 접촉은 ignore 지정).

${reqText}

[부품 스키마]
${PART_SCHEMA}

[출력] 마지막에 JSON 코드블록 하나:
\`\`\`json
{ "type": "custom", "title": "제품명", "period": 4, "parts": [ ... ], "assumptions": ["..."], "questions": ["..."] }
\`\`\``;

    case 'quote': return `기계설계·제작 견적 검토를 부탁합니다. 아래 자동 산출 견적이 한국 시장(${new Date().getFullYear()}년, 소량 주문) 기준으로 적정한지 항목별로 검토하고,
누락된 비용(예: 전기 인증, 설치, 출장, 금형, 안전 커버)과 리스크를 지적한 뒤 저가/표준/고가 최종 권장가를 표로 제시해 주세요.

${reqText}

[자동 산출 견적]
${extra.quoteText || ''}

[BOM]
${extra.bomText || ''}`;

    case 'drawing': return `아래 부품 BOM과 자동 생성 도면 주기를 검토해 주세요. 가공성(DFM), 공차·끼워맞춤 지시 누락, 재질/표면처리 적합성,
표준품으로 대체 가능한 부품, 원가 절감안을 부품별로 제시하고, 수정이 필요한 부품은 아래 JSON 형식으로 출력해 주세요.

${reqText}

[BOM]
${extra.bomText || ''}

\`\`\`json
{ "changes": [ { "pn": "부품pn", "mat": "재질키(선택)", "proc": "공정키(선택)", "note": "도면 주기에 추가할 문구" } ] }
\`\`\``;

    case 'vendor': return `가공 외주업체에 보낼 견적 요청 이메일을 정중하고 간결하게 작성해 주세요. (한국어 비즈니스 메일)
- 발신: ${extra.company || ''} ${extra.designer || ''}
- 수신: ${extra.vendorName || '협력사'}
- 프로젝트: ${project?.no || ''} ${project?.title || ''}
- 요청 품목:
${extra.items || ''}
- 회신 요청: 단가, 총액, 납기, 견적 유효기간 / 도면은 첨부 ZIP 참조 / 희망 납기 ${extra.due || '협의'}`;

    case 'reply': return `고객에게 보낼 설계 의뢰 회신 이메일을 작성해 주세요. (전문적이지만 친절하게, 한국어)
- 내용: 의뢰 감사, 이해한 요구사항 요약, 추가 확인 질문(번호 목록), 3단계 예상 견적 요약, 3D 컨셉 링크 안내, 다음 단계(미팅/계약) 제안.
${reqText}

[예상 견적]
${extra.quoteText || ''}

[3D 컨셉 링크]
${extra.shareUrl || '(링크 생성 후 붙여넣기)'}`;

    default: return '';
  }
}

export const PROMPT_KINDS = [
  { key: 'analyze', name: '① 의뢰 정밀 분석 + 설계 JSON', apply: true },
  { key: 'sketch', name: '② 손그림/도면 → 3D 부품 JSON', apply: true },
  { key: 'quote', name: '③ 견적 적정성 검토', apply: false },
  { key: 'drawing', name: '④ 도면·BOM 검토 (DFM)', apply: true },
  { key: 'vendor', name: '⑤ 외주 견적요청 메일 작성', apply: false },
  { key: 'reply', name: '⑥ 고객 회신 메일 작성', apply: false },
];

export function bomText(built) {
  return bomRows(built.parts).map((r) => `${r.no}. ${r.name} | ${r.matText} | ${r.sizeText || ''} | ${r.qty}EA | ${r.procText}`).join('\n');
}

/** AI 가 만든 custom 부품 JSON 검증 */
export function validateParts(parts) {
  const errs = [];
  if (!Array.isArray(parts) || !parts.length) return ['parts 배열이 비어 있습니다.'];
  const ids = new Set();
  parts.forEach((p, i) => {
    const tag = `#${i + 1}(${p.id || p.name || '?'})`;
    if (!p.id) p.id = 'p' + (i + 1);
    if (ids.has(p.id)) errs.push(`${tag}: id 중복`); ids.add(p.id);
    if (p.shape !== 'box' && p.shape !== 'cyl') errs.push(`${tag}: shape 은 box/cyl`);
    if (p.shape === 'box' && !(Array.isArray(p.size) && p.size.length === 3 && p.size.every((v) => v > 0))) errs.push(`${tag}: size [X,Y,Z] 필요`);
    if (p.shape === 'cyl' && !(p.d > 0 && p.len > 0 && ['x', 'y', 'z'].includes(p.axis))) errs.push(`${tag}: d, len, axis 필요`);
    if (!(Array.isArray(p.pos) && p.pos.length === 3)) errs.push(`${tag}: pos [x,y,z] 필요`);
    if (p.mat && !MATERIALS[p.mat] && !p.std) errs.push(`${tag}: 알 수 없는 재질 ${p.mat}`);
    if (!p.std && !p.mat) p.mat = 'SS400';
    if (!p.std && !p.proc) p.proc = 'milling';
    if (p.std && !Array.isArray(p.price)) p.price = [0, 0, 0];
  });
  return errs;
}
