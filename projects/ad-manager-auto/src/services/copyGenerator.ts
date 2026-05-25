import { env } from "../config/env.js";
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
    message?: string;
  };
};

const copySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    bodies: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string" }
    },
    titles: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string" }
    },
    call_to_action_types: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "string",
        enum: ["APPLY_NOW", "LEARN_MORE", "VIEW_INSTAGRAM_PROFILE"]
      }
    },
    primary_call_to_action_type: {
      type: "string",
      enum: ["APPLY_NOW", "LEARN_MORE", "VIEW_INSTAGRAM_PROFILE"]
    },
    reasoning: { type: "string" }
  },
  required: ["bodies", "titles", "call_to_action_types", "primary_call_to_action_type", "reasoning"]
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

Подавайся до 28 січня на стажування та ставай частиною нашого всесвіту 🪐`,
  "Запрошуємо тебе на івент «Маркетинг Спікізі», де топові маркетологи діляться досвідом у невимушеній атмосфері бару.",
  "Реєструйся на івент для маркетологів «Маркетинг Спікізі», де маркетологи наливатимуть інсайти за баром. Ця подія стане поєднанням неформальної атмосфери, корисного контенту та джерелом натхнення.",
  "Мрієш про кар'єру в маркетингу, але досвіду немає? Тоді лови можливість та подавайся на стажування для креативних маркетологів від продуктової IT-компанії Universe Group. Подавайся до 28 січня на стажування та ставай частиною нашого всесвіту 🪐",
  "Мрієш працювати в EdTech ніші?",
  `Мрієш розпочати кар'єру в маркетингу? Не зволікай — подавайся на стажування для креативних маркетологів!

На тебе чекає:
📌 Два тижні практичних завдань та теоретичних лекцій по 4 години на день в офісі на Подолі.
📌 Менторство від лідів напрямків маркетингу та креативу
📌 Для кращих інтернів – можливість залишитись з нами для подальшого працевлаштування.

Подавайся до 28 січня на стажування та ставай частиною нашого всесвіту 🪐`,
  `Шукаємо HR Business Partner, що тісно працюватиме з кількома командами Universe Group.

Тобі до нас, якщо ти прагнеш:
- Бути партнером/кою для співробітників, менеджерів та впливати на процеси компанії`,
  "Хочеш працювати в EdTech ніші?",
  "Шукаємо Junior Marketing Specialist",
  "Шукаємо Junior Digital Marketing Specialist",
  "Мрієш стати Product Manager, але досвіду ще немає? Ми в Universe Group шукаємо Trainee Product Manager! Твій продуктовий майндсет і бажання розвиватися для нас важливіші за комерційний досвід 👩🏻‍🚀"
];

const historicalTitles = [
  "Відгукуйся на вакансію",
  "Подавайся на стажування",
  "Подавайся до 28 січня",
  "Хочеш працювати в EdTech ніші?",
  "Реєстуйся на івент для маркетологів",
  "Universe Group"
];

function responseText(response: OpenRouterResponse): string | undefined {
  const text = response.choices?.[0]?.message?.content?.trim();
  return text || undefined;
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
  return `You are an expert Meta Ads copywriter for Universe — це ко-фаундингова IT-компанія, що вже понад 8 років створює та виводить tech-бізнеси на глобальний рівень, користувачами яких є понад 400 млн користувачів у 186 країнах світу.
Також Universe будує нові tech-бізнеси з нуля до глобального рівня та шукає ко-фаундерів для їх запуску.

Your task: given a job vacancy URL, generate several strong ad copy options for one Meta ad creative.
Important context: one vacancy can have 4-8 different creative assets. Each creative still needs multiple bodies, titles, and CTA button options so Meta can combine variants.

## Step 1 — Read the vacancy
The vacancy URL is: ${input.ctaLink ?? input.creative.cta_link ?? "not provided"}
The backend has already fetched the page. Extract from the provided vacancy page content: job title, key requirements, key benefits, seniority level, team/product.

## Step 2 — Generate body text options
Generate 3-6 body texts for this creative.
Reuse or adapt the historical body texts when they fit the vacancy.
If none fits well, write NEW body texts in the same style and tone as the examples.

### Historical body texts (ordered by usage frequency):
${historicalBodyTexts.map((text, index) => `${index + 1}. ${text}`).join("\n\n")}

## Step 3 — Generate title options
Generate 3-6 title options.
Use historical titles when they fit, or write new ones.
Each title must be max 5 words.

### Historical titles:
${historicalTitles.map((title) => `- ${title}`).join("\n")}

## Step 4 — Select CTA button options
Rules:
- Use APPLY_NOW for all job vacancies and internships
- Use LEARN_MORE for events, announcements, or general content
- Use VIEW_INSTAGRAM_PROFILE only if the link leads to Instagram
Return 1-3 CTA types and mark the best one as primary_call_to_action_type.

## Step 5 — Return JSON only
Return ONLY a valid JSON object, no explanation, no markdown:

{
  "bodies": ["body text option 1", "body text option 2", "body text option 3"],
  "titles": ["title option 1", "title option 2", "title option 3"],
  "call_to_action_types": ["APPLY_NOW"],
  "primary_call_to_action_type": "APPLY_NOW",
  "reasoning": "1 sentence explaining your choices"
}

Current creative context JSON:
${JSON.stringify(compactContext(input), null, 2)}

Fetched vacancy page:
${JSON.stringify(vacancy ?? null, null, 2)}`;
}

export async function generateCreativeCopy(input: CopyGenerationInput): Promise<CopyGenerationResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError("OPENROUTER_API_KEY is not configured", {
      statusCode: 503,
      code: "OPENROUTER_NOT_CONFIGURED"
    });
  }

  const vacancyUrl = input.ctaLink ?? input.creative.cta_link;
  const vacancy = isHttpUrl(vacancyUrl) ? await fetchVacancy(vacancyUrl) : undefined;
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
    body: JSON.stringify({
      ...(env.OPENROUTER_MODEL ? { model: env.OPENROUTER_MODEL } : {}),
      messages: [
        {
          role: "system",
          content:
            "You generate Universe Meta ads copy. Follow the user's prompt exactly and return only valid JSON matching the schema."
        },
        {
          role: "user",
          content: buildPrompt(input, vacancy)
        }
      ],
      temperature: 0.7,
      max_tokens: 1800,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "creative_copy_suggestions",
          strict: true,
          schema: copySchema
        }
      },
      provider: {
        require_parameters: true
      },
      plugins: [{ id: "response-healing" }]
    })
  });

  const body = (await response.json().catch(() => ({}))) as OpenRouterResponse;
  if (!response.ok) {
    throw new AppError(body.error?.message ?? `OpenRouter request failed: ${response.status}`, {
      statusCode: 502,
      code: "OPENROUTER_REQUEST_FAILED"
    });
  }

  const text = responseText(body);
  if (!text) {
    throw new AppError("OpenRouter response did not include generated copy", {
      statusCode: 502,
      code: "OPENROUTER_EMPTY_RESPONSE"
    });
  }

  let parsed: GeneratedCopyJson;
  try {
    parsed = JSON.parse(text) as GeneratedCopyJson;
  } catch {
    throw new AppError("OpenRouter response was not valid JSON", {
      statusCode: 502,
      code: "OPENROUTER_INVALID_RESPONSE"
    });
  }

  return {
    adTextVariants: cleanTextList(parsed.bodies, 6),
    headline: cleanTextList(parsed.titles, 1)[0]?.slice(0, 80) || null,
    headlineVariants: cleanTextList(parsed.titles, 6).slice(1).map((title) => title.slice(0, 80)),
    ctaTypeVariants: normalizeCtaTypeList(normalizeCtaType(parsed.primary_call_to_action_type), parsed.call_to_action_types, 3),
    reasoning: parsed.reasoning?.trim() || null
  };
}
