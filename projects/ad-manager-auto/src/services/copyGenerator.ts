import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { Creative } from "../types.js";
import { AppError } from "../utils/errors.js";
import { cleanTextList, normalizeCtaType, normalizeCtaTypeList } from "../shared/creativeCopy.js";

export type CopyGenerationInput = {
  creative: Creative;
  projectType?: string | null;
  adText?: string | null;
  headline?: string | null;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string | null;
  ctaTypeVariants?: string[];
  ctaLink?: string | null;
  audience?: string | null;
  location?: string | null;
};

export type CopyGenerationResult = {
  adTextVariants: string[];
  headline?: string | null;
  headlineVariants: string[];
  ctaTypeVariants: string[];
  reasoning?: string | null;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    code?: string | number;
    message?: string;
    metadata?: unknown;
  };
};

type OpenRouterMessage = {
  role: "system" | "user";
  content: string;
};

type OpenRouterRequestBody = {
  model?: string;
  messages: OpenRouterMessage[];
  temperature: number;
  max_tokens: number;
  response_format?: unknown;
  provider?: {
    require_parameters: true;
  };
  plugins?: Array<{ id: string }>;
};

const copySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    body: {
      type: "string"
    },
    title: {
      type: "string"
    },
    call_to_action_type: {
      type: "string",
      enum: ["APPLY_NOW", "LEARN_MORE", "VIEW_INSTAGRAM_PROFILE"]
    },
    reasoning: { type: "string" }
  },
  required: ["body", "title", "call_to_action_type", "reasoning"]
} as const;

type GeneratedCopyJson = {
  bodies: string[];
  titles: string[];
  call_to_action_types: string[];
  primary_call_to_action_type: string;
  reasoning: string;
};

const historicalBodyTexts = [
  `Мрієш про кар'єру в маркетингу, але досвіду немає? Тоді лови можливість та подавайся на стажування для креативних маркетологів!

На тебе чекає:
📌 Два тижні практичних завдань та теоретичних лекцій по 4 години на день в офісі на Подолі.
📌 Менторство від лідів напрямків маркетингу та креативу
📌 Для кращих інтернів – можливість залишитись з нами для подальшого працевлаштування.

Переходь на наступний рівень.`,
  "Запрошуємо тебе на івент «Маркетинг Спікізі», де топові маркетологи діляться досвідом у невимушеній атмосфері бару.",
  "Реєструйся на івент для маркетологів «Маркетинг Спікізі», де маркетологи наливатимуть інсайти за баром. Ця подія стане поєднанням неформальної атмосфери, корисного контенту та джерелом натхнення.",
  `Мрієш про кар'єру в маркетингу, але досвіду немає? Тоді лови можливість та подавайся на стажування для креативних маркетологів від продуктової IT-компанії Universe Group.

Переходь на наступний рівень.`,
  "Мрієш працювати в EdTech ніші?",
  `Мрієш розпочати кар'єру в маркетингу? Не зволікай — подавайся на стажування для креативних маркетологів!

На тебе чекає:
📌 Два тижні практичних завдань та теоретичних лекцій по 4 години на день в офісі на Подолі.
📌 Менторство від лідів напрямків маркетингу та креативу
📌 Для кращих інтернів – можливість залишитись з нами для подальшого працевлаштування.

Переходь на наступний рівень.`,
  `Шукаємо HR Business Partner, що тісно працюватиме з кількома командами Universe Group.

Тобі до нас, якщо прагнеш:
- Бути партнером/кою для співробітників, менеджерів та впливати на процеси компанії.

Твій наступний рівень в Universe.`,
  "Хочеш працювати в EdTech ніші?",
  `Мрієш розпочати кар'єру в маркетингу? Не зволікай — подавайся на стажування для креативних маркетологів!

Переходь на наступний рівень.`,
  "Шукаємо Junior Marketing Specialist.",
  "Мрієш про кар'єру в маркетингу, але досвіду немає? Тоді лови можливість стажування для креативних маркетологів 🤩 Гортай карусель і дізнавайся деталі!",
  "Вакансія для Event Manager'a, який любить створювати події, що залишаються в серці ✨",
  `Мрієш стати Product Manager, але досвіду ще немає? Ми в Universe Group шукаємо Trainee Product Manager! Твій продуктовий майндсет і бажання розвиватися для нас важливіші за комерційний досвід 👩🏻‍🚀

Переходь на наступний рівень.`
];

const historicalBodyTextUsageCounts = ["22x", "22x", "18x", "17x", "17x", "14x", "14x", "13x", "10x", "8x", "4x", "2x", "1x"];

const historicalTitles = [
  "Відгукуйся на вакансію",
  "Подавайся на стажування",
  "Хочеш працювати в EdTech ніші?",
  "Реєстуйся на івент для маркетологів"
];

const preferredNewTitles = [
  "Переходь на наступний рівень",
  "Кидаєш собі виклик?",
  "Твій наступний рівень — тут",
  "[Role name] в Universe"
];

const responseFormatSchema = {
  type: "json_schema",
  json_schema: {
    name: "creative_copy_suggestions",
    strict: true,
    schema: copySchema
  }
} as const;

function responseText(response: OpenRouterResponse): string | undefined {
  const text = response.choices?.[0]?.message?.content?.trim();
  return text || undefined;
}

function loggableAttemptError(error: unknown) {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return error;
}

function upstreamStatus(error: unknown): number | undefined {
  if (!(error instanceof AppError) || !error.details || typeof error.details !== "object") {
    return undefined;
  }

  const details = error.details as Record<string, unknown>;
  return typeof details.upstreamStatus === "number" ? details.upstreamStatus : undefined;
}

function shouldRetryOpenRouterAttempt(error: unknown): boolean {
  const status = upstreamStatus(error);
  return status === undefined || ![401, 402, 403, 429].includes(status);
}

function compactContext(input: CopyGenerationInput) {
  const creative = input.creative;
  return {
    creativeId: creative.id,
    sourceFileName: creative.source_file_name,
    assetType: creative.asset_type,
    projectType: input.projectType ?? creative.project_type,
    primaryText: input.adText ?? creative.ad_text,
    headline: input.headline ?? creative.headline,
    currentHeadlineVariants: input.headlineVariants ?? creative.headline_variants,
    currentTextVariants: input.adTextVariants ?? creative.ad_text_variants,
    ctaType: input.ctaType ?? creative.cta_type,
    ctaTypeVariants: input.ctaTypeVariants ?? creative.cta_type_variants,
    ctaLink: input.ctaLink ?? creative.cta_link,
    audience: input.audience ?? creative.audience,
    location: input.location ?? creative.location,
    campaign: creative.campaign_name ?? creative.campaign_id,
    adSet: creative.adset_name ?? creative.adset_id
  };
}

function isHttpUrl(value?: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHtmlTitle(html: string): string | undefined {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? htmlToText(title).slice(0, 200) : undefined;
}

async function fetchVacancy(url: string): Promise<{ url: string; title?: string; text: string }> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "PromoAdsCopyGenerator/1.0"
    }
  });

  if (!response.ok) {
    throw new AppError(`Could not read vacancy URL: ${response.status}`, {
      statusCode: 400,
      code: "VACANCY_URL_FETCH_FAILED"
    });
  }

  const html = await response.text();
  const text = htmlToText(html).slice(0, 12000);
  if (!text) {
    throw new AppError("Vacancy URL did not contain readable text", {
      statusCode: 400,
      code: "VACANCY_URL_EMPTY"
    });
  }

  return {
    url,
    title: extractHtmlTitle(html),
    text
  };
}

function buildPrompt(input: CopyGenerationInput, vacancy?: { url: string; title?: string; text: string }) {
  const vacancyUrl = input.ctaLink ?? input.creative.cta_link ?? "not provided";

  return `You are an expert Meta Ads copywriter for Universe  — Universe — це ко-фаундингова IT-компанія, що вже понад 8 років створює та виводить tech-бізнеси на глобальний рівень, користувачами яких є понад 400 млн користувачів у 186 країнах світу.
Також Universe будує нові tech-бізнеси з нуля до глобального рівня та шукає ко-фаундерів для їх запуску. (Guru Apps, Wisey, FORMA).

Your task: given a job vacancy URL, generate the best ad copy for a Meta ad creative that matches Universe Group's brand positioning and tone of voice.

---

## UNIVERSE BRAND POSITIONING & TONE OF VOICE

**Brand idea: "Рівень: Universe"**
The brand is built around the concept of "рівень" (level). Universe sets a high bar — not as a ceiling, but as a starting point that grows with every person and the company itself.

**Core promise:** "Ми не обіцяємо, що буде легко. Ми обіцяємо, що з нами ти не залишишся тим самим."

**Target audience:** People who are never satisfied with where they are. Challengers who compete with their past self, not others.

**Communication principles — always follow these:**

✅ DO:
- Write like a human talking to another human — no corporate clichés
- Be honest and direct — name difficulties, don't sugarcoat
- Speak as equals — never talk down, never talk up
- Compare the person to their past self (never to others)
- Focus on personal challenge → team → business impact
- Use the language of challenge, growth, movement: "виклик", "рівень", "зростання", "динаміка", "переходити далі"

❌ DON'T:
- Use corporate stamps: "запрошуємо долучитися", "комфортні умови", "молодий колектив", "маємо честь"
- Promise easy starts: "комфортний старт", "плавне входження", "без стресу"
- Compare to other companies: "кращі за ринок", "топові спеціалісти галузі"
- Use cosmic metaphors or old slogans: "всесвіт", "ставай частиною нашого всесвіту 🪐" — these are discontinued
- Use coaching clichés: "вийти з зони комфорту", "пересилити себе"
- Use corporate IT perks as the main hook: "плюшки", "атмосфера", "друзі"
- Sound arrogant or exclusive: "до нашого рівня дотягуються одиниці"

**Approved CTA phrases (use to end body text or as title):**
- Переходь на наступний рівень ← main slogan
- Кидаєш собі виклик? Ми приймаємо
- Твій наступний рівень в Universe
- Переходь на рівень Universe
- Рости далі в Universe
- Рівень: Universe
- Твій виклик — наш виклик

**Forbidden words/phrases:** всесвіт, космос, ставай частиною нашого всесвіту, пересилити, зона комфорту, стабільність, атмосфера, плюшки, друзі, заохочуємо долучитися

The TOV and forbidden words/phrases take priority over historical examples. Never return forbidden words or phrases, even if a historical example contains them.

---

## STEP 1 — Read the vacancy
Fetch and read the content at this URL: ${vacancyUrl}
Extract: job title, seniority level, key responsibilities, required skills, product/team context.

## STEP 2 — Select or write the body text
Choose the single most relevant body text from the historical examples below, OR write a NEW one if none fits well.

If writing new: follow the TOV above. Structure: hook (challenge/question) → what the person will do/face → what they'll get (team, growth, impact) → end with one of the approved CTA phrases.

### Historical body texts (ordered by usage frequency):

${historicalBodyTexts.map((text, index) => `${index + 1}. [${historicalBodyTextUsageCounts[index]}] ${text}`).join("\n\n")}

## STEP 3 — Select the title
Choose from the list below or write a new one (max 6 words, TOV-aligned).

### Historical titles:
${historicalTitles.map((title) => `- ${title}`).join("\n")}

### Preferred new titles (aligned with TOV):
${preferredNewTitles.map((title) => `- ${title}`).join("\n")}

## STEP 4 — Select the CTA button
- APPLY_NOW — all job vacancies and internships
- LEARN_MORE — events, announcements, general content
- VIEW_INSTAGRAM_PROFILE — only if link leads to Instagram

## STEP 5 — Return JSON only
Return ONLY a valid JSON object, no explanation, no markdown:

{
  "body": "selected or generated body text",
  "title": "selected or generated title",
  "call_to_action_type": "APPLY_NOW or LEARN_MORE or VIEW_INSTAGRAM_PROFILE",
  "reasoning": "1 sentence explaining your choices and how they align with Universe TOV"
}

Current creative context JSON:
${JSON.stringify(compactContext(input), null, 2)}

Fetched vacancy page:
${JSON.stringify(vacancy ?? null, null, 2)}`;
}

async function tryFetchVacancy(url?: string | null): Promise<{ url: string; title?: string; text: string } | undefined> {
  if (!isHttpUrl(url)) {
    return undefined;
  }

  try {
    return await fetchVacancy(url);
  } catch (error) {
    logger.warn({ url, error: loggableAttemptError(error) }, "Skipping unreadable CTA URL for copy generation");
    return undefined;
  }
}

function buildMessages(input: CopyGenerationInput, vacancy?: { url: string; title?: string; text: string }): OpenRouterMessage[] {
  return [
    {
      role: "system",
      content:
        "You generate Universe Meta ads copy. Follow the user's prompt exactly and return only valid JSON with body, title, call_to_action_type, and reasoning."
    },
    {
      role: "user",
      content: buildPrompt(input, vacancy)
    }
  ];
}

function openRouterAttempts(messages: OpenRouterMessage[]): Array<{ name: string; body: OpenRouterRequestBody }> {
  const base: OpenRouterRequestBody = {
    ...(env.OPENROUTER_MODEL ? { model: env.OPENROUTER_MODEL } : {}),
    messages,
    temperature: 0.7,
    max_tokens: 1800
  };

  return [
    {
      name: "json_schema",
      body: {
        ...base,
        response_format: responseFormatSchema,
        provider: {
          require_parameters: true
        },
        plugins: [{ id: "response-healing" }]
      }
    },
    {
      name: "json_object",
      body: {
        ...base,
        response_format: {
          type: "json_object"
        },
        plugins: [{ id: "response-healing" }]
      }
    },
    {
      name: "plain_json",
      body: base
    }
  ];
}

function openRouterErrorMessage(body: OpenRouterResponse, status: number): string {
  return body.error?.message?.trim() || `OpenRouter request failed: ${status}`;
}

function parseJsonCandidate(candidate: string): unknown {
  return JSON.parse(candidate);
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fence) {
    candidates.push(fence);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return [...new Set(candidates)].filter(Boolean);
}

function normalizeGeneratedCta(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return normalized || undefined;
}

function cleanGeneratedTextList(values: unknown, maxItems: number): string[] {
  if (typeof values === "string") {
    const text = values.trim();
    return text ? [text] : [];
  }
  return cleanTextList(values, maxItems);
}

function normalizeGeneratedCopy(value: unknown): GeneratedCopyJson {
  if (!value || typeof value !== "object") {
    throw new Error("Generated copy was not an object");
  }

  const record = value as Record<string, unknown>;
  const bodies = cleanGeneratedTextList(record.bodies ?? record.body_texts ?? record.texts ?? record.body ?? record.text, 1);
  const titles = cleanGeneratedTextList(record.titles ?? record.headlines ?? record.title ?? record.headline, 1).map((title) => title.slice(0, 80));
  const callToActionTypes = cleanGeneratedTextList(
    record.call_to_action_types ?? record.call_to_action_type ?? record.cta_types ?? record.ctas,
    1
  )
    .map(normalizeGeneratedCta)
    .filter((type): type is string => Boolean(type));
  const primaryCallToActionType =
    normalizeGeneratedCta(
      record.primary_call_to_action_type ?? record.call_to_action_type ?? record.primary_cta_type ?? record.cta_type
    ) ??
    callToActionTypes[0] ??
    "LEARN_MORE";
  const reasoning = typeof record.reasoning === "string" ? record.reasoning : "";

  if (!bodies.length || !titles.length) {
    throw new Error("Generated copy did not include body and title options");
  }

  return {
    bodies,
    titles,
    call_to_action_types: callToActionTypes.length ? callToActionTypes : [primaryCallToActionType],
    primary_call_to_action_type: primaryCallToActionType,
    reasoning
  };
}

function parseGeneratedCopy(text: string): GeneratedCopyJson {
  let lastError: unknown;
  for (const candidate of jsonCandidates(text)) {
    try {
      return normalizeGeneratedCopy(parseJsonCandidate(candidate));
    } catch (error) {
      lastError = error;
    }
  }

  throw new AppError("OpenRouter response was not valid generated copy JSON", {
    statusCode: 502,
    code: "OPENROUTER_INVALID_RESPONSE",
    details: loggableAttemptError(lastError)
  });
}

async function requestOpenRouterCopy(attempt: { name: string; body: OpenRouterRequestBody }): Promise<GeneratedCopyJson> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "content-type": "application/json",
    "X-OpenRouter-Title": "Promo Ads"
  };
  if (env.PUBLIC_BASE_URL) {
    headers["HTTP-Referer"] = env.PUBLIC_BASE_URL;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify(attempt.body)
  });

  const body = (await response.json().catch(() => ({}))) as OpenRouterResponse;
  if (!response.ok) {
    throw new AppError(openRouterErrorMessage(body, response.status), {
      statusCode: 502,
      code: "OPENROUTER_REQUEST_FAILED",
      details: {
        attempt: attempt.name,
        upstreamStatus: response.status,
        providerError: body.error
      }
    });
  }

  const text = responseText(body);
  if (!text) {
    throw new AppError("OpenRouter response did not include generated copy", {
      statusCode: 502,
      code: "OPENROUTER_EMPTY_RESPONSE",
      details: {
        attempt: attempt.name
      }
    });
  }

  return parseGeneratedCopy(text);
}

async function generateWithOpenRouter(messages: OpenRouterMessage[]): Promise<GeneratedCopyJson> {
  let lastError: unknown;
  const attempts = openRouterAttempts(messages);
  for (const [index, attempt] of attempts.entries()) {
    try {
      return await requestOpenRouterCopy(attempt);
    } catch (error) {
      lastError = error;
      const hasNextAttempt = index < attempts.length - 1;
      if (!hasNextAttempt || !shouldRetryOpenRouterAttempt(error)) {
        break;
      }
      logger.warn({ attempt: attempt.name, error: loggableAttemptError(error) }, "Retrying copy generation with a more compatible OpenRouter request");
    }
  }

  throw lastError;
}

export async function generateCreativeCopy(input: CopyGenerationInput): Promise<CopyGenerationResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError("OPENROUTER_API_KEY is not configured", {
      statusCode: 503,
      code: "OPENROUTER_NOT_CONFIGURED"
    });
  }

  const vacancyUrl = input.ctaLink ?? input.creative.cta_link;
  const vacancy = await tryFetchVacancy(vacancyUrl);
  const parsed = await generateWithOpenRouter(buildMessages(input, vacancy));

  return {
    adTextVariants: cleanTextList(parsed.bodies, 1),
    headline: cleanTextList(parsed.titles, 1)[0]?.slice(0, 80) || null,
    headlineVariants: [],
    ctaTypeVariants: normalizeCtaTypeList(normalizeCtaType(parsed.primary_call_to_action_type), parsed.call_to_action_types, 1),
    reasoning: parsed.reasoning?.trim() || null
  };
}
