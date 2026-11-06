import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { UserFacingError } from "./errors";
import { getLayout, normalizeFields, type Fields, type LayoutDef } from "./magazine";
import { isMockMode, openai, TEXT_MODEL } from "./openai";

/**
 * 매거진 레이아웃 칸 채우기 — 한 장의 내용(각색된 글 + 원본 글)을 고른 양식의 칸에 맞게 나눠 쓴다.
 * 후보 양식이 여럿이면(속지 '자동') 먼저 이 내용에 가장 맞는 양식을 고른다.
 */
export type FillRequest = {
  /** 후보 레이아웃 id (하나면 그걸로, 여럿이면 AI가 고름) */
  layouts: string[];
  /** 이 장에 들어갈 글 (각색된 글) */
  text: string;
  /** 이 장의 원본 글 (참고) */
  original?: string;
  /** 게시물 전체 흐름 (다른 장 글들) — 칸이 남을 때 보충 근거 */
  context?: string;
  /** 이 장에 사진이 있는지 */
  hasPhoto?: boolean;
  /** 몇 번째 장인지 (1부터) */
  index?: number;
};

export type FillResult = { layout: string; fields: Fields };

class FillError extends UserFacingError {}

const SYSTEM = `당신은 인스타그램 매거진형 카드뉴스 에디터입니다.
한 장에 들어갈 내용을, 주어진 '양식'의 칸에 맞게 나눠 씁니다.

■ 규칙
- 각 칸의 설명과 글자 수 제한을 꼭 지킵니다. 목록 칸은 정확히 정해진 개수로 씁니다.
- 줄바꿈은 \\n 으로 넣습니다. 칸 설명에 '정확히 N줄'이 있으면 그 줄 수를 지킵니다.
- 내용은 주어진 글에서 가져옵니다. 이름·숫자·가격·날짜·장소 같은 사실은 지어내지 않습니다.
  칸을 채울 내용이 모자라면 게시물 전체 흐름에서 보충하고, 그래도 없으면 사실 주장이 없는 일반적인 문장(팁·느낌·추천)으로 채웁니다.
- 말투는 주어진 글의 말투(반말·존댓말)를 그대로 따릅니다.
- 이모지는 쓰지 않습니다. 번호(1. Q1.)·따옴표는 앱이 붙이니 칸에 넣지 마세요(칸 설명이 요구하는 경우 제외).
- 표지 양식이면 눈길을 끄는 제목으로, 마지막 장 양식이면 저장·공유·팔로우를 자연스럽게 권하는 마무리로 씁니다.`;

function schemaFor(def: LayoutDef) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.fields) {
    shape[f.key] = f.count
      ? z.array(z.string()).describe(`${f.desc} — 정확히 ${f.count}개, 항목마다 ${f.max}자 이내`)
      : z.string().describe(`${f.desc} — ${f.max}자 이내`);
  }
  return z.object(shape);
}

async function pick(client: OpenAI, defs: LayoutDef[], req: FillRequest): Promise<LayoutDef> {
  const ids = defs.map((d) => d.id) as [string, ...string[]];
  const list = defs.map((d) => `- ${d.id}: ${d.name} — ${d.desc}${d.photo ? " (사진 들어감)" : " (사진 없음)"}`).join("\n");
  const res = await client.responses.parse({
    model: TEXT_MODEL,
    instructions:
      "인스타그램 매거진 카드뉴스 한 장의 내용을 보고, 그 내용이 가장 잘 살아나는 양식 하나를 고릅니다. " +
      "목록·순위·비교·일정·질문답처럼 구조가 있으면 그 구조의 양식을, 이야기·설명이면 본문형 양식을 고르세요. " +
      (req.hasPhoto ? "이 장에는 사진이 있으니 사진이 들어가는 양식을 우선합니다." : "이 장에는 사진이 없으니 사진 없는 양식을 우선합니다."),
    input: [{ role: "user", content: `<양식들>\n${list}\n</양식들>\n\n<이 장 내용>\n${req.text}\n</이 장 내용>` }],
    text: { format: zodTextFormat(z.object({ layout: z.enum(ids) }), "pick_layout") },
    reasoning: { effort: "low" },
    max_output_tokens: 2000,
    store: false,
  });
  return defs.find((d) => d.id === res.output_parsed?.layout) ?? defs[0];
}

function mockFill(def: LayoutDef, req: FillRequest): Fields {
  const first = req.text.split("\n").find(Boolean) ?? "";
  const f = structuredClone(def.sample);
  const k = def.fields.find((x) => !x.count && x.key !== "num" && x.key !== "hl")?.key;
  if (k) f[k] = `[데모] ${first || String(f[k])}`.slice(0, 40);
  return f;
}

export async function fillLayout(req: FillRequest): Promise<FillResult> {
  const defs = req.layouts.map(getLayout).filter((d): d is LayoutDef => !!d);
  if (!defs.length) throw new FillError("양식을 찾지 못했어요.");
  if (!req.text?.trim() && !req.original?.trim()) throw new FillError("이 장에 글이 없어요.");

  if (isMockMode()) {
    const def = defs.length > 1 ? defs[(req.index ?? 0) % defs.length] : defs[0];
    return { layout: def.id, fields: normalizeFields(def, mockFill(def, req)) };
  }

  const client = openai();
  const def = defs.length > 1 ? await pick(client, defs, req) : defs[0];
  const fieldList = def.fields
    .map((f) => `- ${f.key}: ${f.desc} (${f.count ? `${f.count}개, 항목마다 ` : ""}${f.max}자 이내)`)
    .join("\n");
  const input = [
    `<양식>\n${def.name} — ${def.desc}\n칸:\n${fieldList}\n</양식>`,
    `<이 장에 들어갈 글>\n${req.text}\n</이 장에 들어갈 글>`,
    req.original ? `<이 장 원본 글 (참고)>\n${req.original}\n</이 장 원본 글 (참고)>` : "",
    req.context ? `<게시물 전체 흐름 (참고)>\n${req.context.slice(0, 3000)}\n</게시물 전체 흐름 (참고)>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await client.responses
    .parse({
      model: TEXT_MODEL,
      instructions: SYSTEM,
      input: [{ role: "user", content: input }],
      text: { format: zodTextFormat(schemaFor(def), "layout_fields") },
      reasoning: { effort: "low" },
      max_output_tokens: 6000,
      store: false,
    })
    .catch((e) => {
      if (e instanceof OpenAI.APIError) throw e;
      console.error("[fill] 응답 해석 실패", e);
      throw new FillError("양식에 글을 넣지 못했어요. 다시 한 번 눌러 주세요.");
    });
  const out = res.output_parsed as Fields | null;
  if (!out || res.status === "incomplete") throw new FillError("양식에 글을 넣지 못했어요. 다시 한 번 눌러 주세요.");
  return { layout: def.id, fields: normalizeFields(def, out) };
}
