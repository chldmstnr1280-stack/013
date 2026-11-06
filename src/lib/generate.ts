import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { appMode, env } from "./env";
import { logApi } from "./log";
import { CONTENT_TYPES, contentTypeLabel, type ContentType, type Product } from "./types";

export interface GeneratedPost {
  content_type: ContentType;
  angle: string;
  body: string;
}

const TYPE_VALUES = CONTENT_TYPES.map((c) => c.value) as [ContentType, ...ContentType[]];

const OutputSchema = z.object({
  posts: z.array(
    z.object({
      content_type: z.enum(TYPE_VALUES),
      angle: z.string().describe("이 글이 택한 관점을 한 문장으로"),
      body: z.string().describe("Threads 본문. 광고 표시 문구와 링크는 넣지 않는다(시스템이 자동 추가)."),
    }),
  ),
});

const SYSTEM_PROMPT = `당신은 한국어 Threads 게시물을 쓰는 카피라이터입니다. 쿠팡 파트너스 제휴 상품을 소개하는 글을 씁니다.

문체: 친근하고 자연스러운 구어체 한국어. 광고 티가 과하지 않게, 정보가 실제로 도움이 되도록 씁니다. 이모지는 0~2개 정도만.

반드시 지킬 원칙 (위반하면 게시할 수 없습니다):
1. 글쓴이가 그 상품을 실제로 써 봤거나 샀다고 표현하지 않습니다. "써 보니", "샀는데", "내돈내산", "후기", "한 달째 사용 중" 같은 표현 금지. 상품 정보를 소개하는 시점으로만 씁니다.
2. 제공된 상품 정보에 없는 가격, 할인율, 효능, 판매량, 순위, 리뷰 수, 인증 내용을 만들어내지 않습니다. 가격이 제공되지 않았다면 가격을 언급하지 않습니다.
3. "최고", "1위", "완벽", "무조건", "100%", "치료", "효과 보장" 같은 과장·단정 표현을 쓰지 않습니다.
4. 제공된 특징만 근거로 삼고, 일반적인 생활 맥락(계절, 상황, 고민)은 자유롭게 써도 됩니다. 비교 글에서는 특정 경쟁 상품명을 비방하지 말고 "고를 때 비교할 기준" 중심으로 씁니다.
5. 본문에 링크, 해시태그 #광고, 수수료 안내 문구를 넣지 않습니다. 시스템이 본문 끝에 광고 표시를, 답글에 링크를 자동으로 붙입니다.
6. 본문은 공백 포함 380자 이내로 씁니다.
7. 요청된 3개 글은 서로 다른 관점이어야 하고, 첫 문장이 서로 비슷하지 않아야 합니다. 사용자의 기존 게시물이 주어지면 말투를 참고하되 문장을 베끼지 않습니다.`;

export function pickTypes(requested: ContentType[], count = 3): ContentType[] {
  const uniq = [...new Set(requested)].filter((t) => TYPE_VALUES.includes(t));
  for (const t of TYPE_VALUES) if (uniq.length < count && !uniq.includes(t)) uniq.push(t);
  return uniq.slice(0, count);
}

function productBrief(p: Product) {
  return JSON.stringify(
    {
      상품명: p.name.replace(/^\[모의\]\s*/, ""),
      카테고리: p.category,
      확인된_가격_원: p.price ?? "제공되지 않음 (가격 언급 금지)",
      특징: p.features,
      메모: p.notes || undefined,
      정보_확인일: p.info_verified_at ?? "미확인",
    },
    null,
    2,
  );
}

export async function generatePosts(args: {
  userId: string;
  product: Product;
  types: ContentType[];
  referencePosts: string[];
  existingPosts: string[];
  extraInstruction?: string;
}): Promise<{ posts: GeneratedPost[]; model: string; mock: boolean }> {
  const types = pickTypes(args.types);

  if (appMode() === "mock") return { posts: mockPosts(args.product, types), model: "mock", mock: true };
  if (!env.anthropicKey())
    throw new Error("ANTHROPIC_API_KEY 가 설정되지 않아 콘텐츠를 생성할 수 없습니다. 계정 및 API 설정을 확인하세요.");

  const client = new Anthropic({ apiKey: env.anthropicKey() });
  const model = env.anthropicModel();
  const user = [
    `## 상품 정보\n${productBrief(args.product)}`,
    `## 작성할 글 (각 1개, 총 ${types.length}개, 이 순서대로)\n${types
      .map((t, i) => `${i + 1}. ${t} — ${contentTypeLabel(t)}: ${CONTENT_TYPES.find((c) => c.value === t)!.hint}`)
      .join("\n")}`,
    args.referencePosts.length
      ? `## 사용자가 직접 쓴 기존 게시물 (말투 참고용, 문장 복사 금지)\n${args.referencePosts.slice(0, 5).map((b) => `---\n${b}`).join("\n")}`
      : "",
    args.existingPosts.length
      ? `## 이 상품으로 이미 만든 글 (겹치지 않게)\n${args.existingPosts.slice(0, 8).map((b) => `---\n${b}`).join("\n")}`
      : "",
    args.extraInstruction ? `## 추가 요청\n${args.extraInstruction}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: betaZodOutputFormat(OutputSchema) },
      // 안전 분류기가 요청을 거절하면 서버 측에서 대체 모델로 자동 재시도
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new Error("모델이 이 요청에 대한 생성을 거절했습니다. 상품 정보를 확인하세요.");
    if (res.stop_reason === "max_tokens") throw new Error("응답이 길이 제한으로 잘렸습니다. 다시 시도하세요.");
    const parsed = res.parsed_output;
    if (!parsed?.posts?.length) throw new Error("모델 응답을 해석하지 못했습니다.");
    await logApi(args.userId, "claude", "generate_posts", true, `${res.model} · in ${res.usage.input_tokens} / out ${res.usage.output_tokens}`);
    return { posts: parsed.posts.slice(0, types.length), model: res.model, mock: false };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? (e.status ?? null) : null;
    await logApi(args.userId, "claude", "generate_posts", false, (e as Error).message, status);
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Claude API 키가 유효하지 않습니다.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Claude API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.");
    throw e;
  }
}

/** 모의 생성기: 외부 호출 없이 상품 특징으로 템플릿 글을 만든다. 결과는 [모의 생성] 으로 표시된다. */
export function mockPosts(p: Product, types: ContentType[]): GeneratedPost[] {
  const name = p.name.replace(/^\[모의\]\s*/, "");
  const f = p.features.length ? p.features : ["(등록된 특징 없음)"];
  const tpl: Record<ContentType, () => string> = {
    problem_solving: () =>
      `이런 불편함 있으셨다면 참고해 보세요.\n${p.category || "생활"} 쪽에서 은근히 신경 쓰이는 부분, ${name}은 '${f[0]}' 점이 눈에 띄어요.`,
    feature: () => `${name}, 상품 정보 기준으로 특징만 정리해 봤어요.\n${f.map((x) => `· ${x}`).join("\n")}`,
    checklist: () =>
      `${name} 고르기 전에 확인해 볼 것\n1. 내 공간/용도에 맞는 크기인지\n2. '${f[0]}' 이 나에게 필요한 기능인지\n3. 상세 페이지의 구성품과 주의사항`,
    comparison: () =>
      `비슷한 ${p.category || "상품"} 비교할 때 보면 좋은 기준\n· 크기와 무게\n· 관리 방법\n· ${f[0]} 같은 기능이 있는지\n이 기준으로 ${name}도 한 번 비교해 보세요.`,
    seasonal: () => `날씨가 바뀌는 요즘, 미리 챙겨 두면 좋은 것 하나.\n${name} — ${f.slice(0, 2).join(", ")}.`,
  };
  return types.map((t) => ({ content_type: t, angle: `${contentTypeLabel(t)} (모의 템플릿)`, body: `[모의 생성] ${tpl[t]()}` }));
}
