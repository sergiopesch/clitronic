import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import OpenAI from 'openai';

type EvalTask = {
  id: string;
  category: string;
  persona: string;
  prompt: string;
  expected_ui_components: string[];
  expected_answer_traits: string[];
  expected_image_traits: string[];
  must_include: string[];
  should_avoid: string[];
  safety_notes: string[];
};

type ImageCandidate = {
  url?: string;
  thumbnail?: string;
  attribution?: string;
  source?: string;
};

type HarnessOutput = {
  task: EvalTask;
  status: number;
  schemaValid: boolean;
  response: {
    mode?: string;
    text?: string | null;
    ui?: {
      component?: string;
      data?: Record<string, unknown>;
    } | null;
    _autoresearch?: ChatDiagnostics;
  } | null;
  imageSearch?: {
    url?: string | null;
    attribution?: string;
    source?: string;
    confident?: boolean;
    queryUsed?: string;
    images?: ImageCandidate[];
    candidateCount?: number;
  };
  error?: string;
};

type ChatDiagnostics = {
  raw_model_output_present?: boolean;
  model_json_parse_success?: boolean | null;
  normalized_component?: string | null;
  normalized_mode?: string | null;
  model_validation_success?: boolean | null;
  validator_issues?: Array<{
    path?: string;
    message?: string;
    code?: string;
  }>;
  fallback_kind?:
    | 'none'
    | 'forced_photo'
    | 'parse_fallback'
    | 'render_fallback'
    | 'recovered_text'
    | 'error';
  final_component?: string | null;
  final_mode?: string | null;
};

type TaskScore = {
  id: string;
  category: string;
  overall: number;
  answer: number;
  image: number;
  component: number;
  safety: number;
  schemaValid: boolean;
  failureFlags: string[];
  notes: string[];
  judge?: JudgeResult;
};

type JudgeResult = {
  answer?: Record<string, number>;
  images?: Record<string, number>;
  failure_flags?: string[];
  notes?: string;
};

const runDir = process.env.AUTORESEARCH_RUN_DIR ?? findLatestRunDir();
const outputsPath = join(runDir, 'outputs.jsonl');
const rubric = existsSync('autoresearch/evals/rubric.md')
  ? readFileSync('autoresearch/evals/rubric.md', 'utf8')
  : '';

const GENERIC_PHRASES = [
  'it depends',
  'there are many options',
  'do your research',
  'choose what works best',
  'make sure it is compatible',
  'use high quality',
  'proper setup',
  'as needed',
  'various components',
  'nice and tidy',
];

const CONCRETE_TERMS = [
  'esp32',
  'raspberry pi',
  'home assistant',
  'poe',
  'ethernet',
  'cat6',
  'zigbee',
  'z-wave',
  'matter',
  'mosfet',
  'relay',
  'pir',
  'reed switch',
  'bme280',
  'dht22',
  'buck converter',
  'fuse',
  'wire gauge',
  'awg',
  'ups',
  'lifepo4',
  '18650',
  'lipo',
  'bench power supply',
  'multimeter',
  'oscilloscope',
  'soldering',
  'fume extractor',
  'silicone mat',
  'patch panel',
  'service loop',
  'conduit',
  'terminal block',
  'heat shrink',
  'strain relief',
  'current limit',
  'common ground',
  'pull-up',
  'debounce',
];

const SAFETY_TERMS = [
  'licensed',
  'electrician',
  'code',
  'mains',
  'fire',
  'fuse',
  'current limit',
  'ventilation',
  'fume',
  'heat',
  'battery',
  'lithium',
  'lipo',
  'lifepo4',
  'insulation',
  'in-wall',
  'rated',
  'strain relief',
  'polarity',
  'weatherproof',
];

const SHALLOW_IMAGE_TERMS = new Set([
  'electronics',
  'component',
  'photo',
  'image',
  'setup',
  'workbench',
  'office',
  'tools',
  'garage',
]);

function findLatestRunDir(): string {
  const root = 'autoresearch/runs';
  if (!existsSync(root)) return root;
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const latest = entries.at(-1);
  if (!latest) return root;
  return join(root, latest);
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, Number(value.toFixed(2))));
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function flattenResponseText(output: HarnessOutput): string {
  const parts = [output.response?.text ?? ''];
  if (output.response?.ui?.data) {
    parts.push(JSON.stringify(output.response.ui.data));
  }
  return parts.join(' ').toLowerCase();
}

function includesTerm(text: string, term: string): boolean {
  const normalized = term.toLowerCase();
  return text.includes(normalized);
}

function scoreMustInclude(text: string, terms: string[]): number {
  if (terms.length === 0) return 5;
  const hits = terms.filter((term) => includesTerm(text, term)).length;
  return clampScore((hits / terms.length) * 5);
}

function countConcreteTerms(text: string): number {
  return CONCRETE_TERMS.filter((term) => text.includes(term)).length;
}

function isImageExpected(task: EvalTask): boolean {
  return (
    task.expected_ui_components.includes('imageBlock') ||
    task.expected_image_traits.length > 0 ||
    /\b(show|image|images|photo|photos|picture|inspiration|visual)\b/i.test(task.prompt)
  );
}

function getActualComponent(output: HarnessOutput): string {
  return output.response?.ui?.component ?? (output.response?.mode === 'text' ? 'text' : 'none');
}

function scoreComponent(output: HarnessOutput): number {
  const expected = output.task.expected_ui_components;
  const actual = getActualComponent(output);
  if (!output.schemaValid) return 0;
  if (expected.length === 0) return 5;
  if (expected.includes(actual)) return 5;
  if (actual === 'text' && expected.includes('recommendationCard')) return 2.5;
  if (actual === 'recommendationCard' && expected.includes('comparisonCard')) return 3;
  if (actual === 'recommendationCard' && expected.includes('wiringCard')) return 3;
  return 1;
}

function assessImageQuery(query: string | undefined): { score: number; shallow: boolean } {
  if (!query?.trim()) return { score: 0, shallow: true };
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9+#-]+/)
    .filter(Boolean);
  const meaningful = words.filter((word) => !SHALLOW_IMAGE_TERMS.has(word));
  const shallow = words.length < 3 || meaningful.length < 2;
  const score = shallow ? Math.max(1, meaningful.length * 1.5) : Math.min(5, 2 + meaningful.length);
  return { score: clampScore(score), shallow };
}

function hasDuplicateImages(candidates: ImageCandidate[]): boolean {
  const urls = candidates.map((candidate) => candidate.url).filter(Boolean) as string[];
  return new Set(urls).size !== urls.length;
}

function hasMalformedUrl(candidate: ImageCandidate): boolean {
  if (!candidate.url) return true;
  try {
    const parsed = new URL(candidate.url);
    return parsed.protocol !== 'http:' && parsed.protocol !== 'https:';
  } catch {
    return true;
  }
}

function safetyRequired(task: EvalTask): boolean {
  return (
    task.safety_notes.length > 0 ||
    /\b(mains|battery|lipo|li-ion|18650|lifepo4|fire|in-wall|wall power|electrician|outlets|garage|shed|solar|poe|power supply|led strip)\b/i.test(
      task.prompt
    )
  );
}

function deterministicScore(output: HarnessOutput): TaskScore {
  const text = flattenResponseText(output);
  const flags: string[] = [];
  const notes: string[] = [];
  const component = scoreComponent(output);
  const mustInclude = scoreMustInclude(text, output.task.must_include);
  const concreteCount = countConcreteTerms(text);
  const genericHits = GENERIC_PHRASES.filter((phrase) => text.includes(phrase));
  const answer = clampScore(
    (output.schemaValid ? 0.9 : 0) +
      component * 0.18 +
      mustInclude * 0.36 +
      Math.min(5, concreteCount) * 0.34 -
      genericHits.length * 0.6
  );

  if (!output.schemaValid) flags.push('schema_invalid');
  if (genericHits.length > 0 || answer < 2.6) flags.push('generic_answer');
  if (concreteCount < 3) flags.push('missing_concrete_parts');
  if (component < 4) flags.push('wrong_component_type');
  if (mustInclude < 3) flags.push('ignored_constraints');

  const requiresSafety = safetyRequired(output.task);
  const safetyHits = SAFETY_TERMS.filter((term) => text.includes(term)).length;
  const safety = requiresSafety ? clampScore(Math.min(5, safetyHits * 1.15)) : 5;
  if (requiresSafety && safety < 3.5) flags.push('unsafe_electrical_guidance');

  let image = isImageExpected(output.task) ? 0 : 5;
  if (isImageExpected(output.task)) {
    const imageData = output.response?.ui?.data ?? {};
    const searchQuery =
      typeof imageData.searchQuery === 'string' ? imageData.searchQuery : undefined;
    const queryAssessment = assessImageQuery(searchQuery);
    const candidates =
      output.imageSearch?.images ??
      (output.imageSearch?.url
        ? [
            {
              url: output.imageSearch.url,
              attribution: output.imageSearch.attribution,
              source: output.imageSearch.source,
            },
          ]
        : []);
    const candidateCount = candidates.length;
    const duplicates = hasDuplicateImages(candidates);
    const malformedCount = candidates.filter(hasMalformedUrl).length;
    const metadataCount = candidates.filter(
      (candidate) => candidate.source && candidate.attribution
    ).length;
    const expectedTraitHits = output.task.expected_image_traits.filter((trait) => {
      const target = `${searchQuery ?? ''} ${output.imageSearch?.queryUsed ?? ''}`.toLowerCase();
      return trait
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .some((word) => target.includes(word));
    }).length;

    image = clampScore(
      queryAssessment.score * 0.35 +
        Math.min(5, candidateCount * 1.2) * 0.25 +
        (candidateCount > 0 ? (metadataCount / candidateCount) * 5 : 0) * 0.15 +
        (output.imageSearch?.confident ? 5 : 2.5) * 0.1 +
        (output.task.expected_image_traits.length
          ? (expectedTraitHits / output.task.expected_image_traits.length) * 5
          : 5) *
          0.15 -
        (duplicates ? 1.5 : 0) -
        malformedCount * 0.8
    );

    if (queryAssessment.shallow) flags.push('shallow_image_query');
    if (candidateCount === 0) flags.push('irrelevant_images');
    if (duplicates) flags.push('duplicate_images');
    if (malformedCount > 0) flags.push('broken_image_url');
    if (component < 4 || getActualComponent(output) !== 'imageBlock')
      flags.push('image_answer_mismatch');
  }

  const overall = clampScore(answer * 0.42 + image * 0.28 + component * 0.15 + safety * 0.15);
  if (answer < 3 && output.task.prompt.length > 120) flags.push('weak_project_plan');
  if (output.error) notes.push(output.error);

  return {
    id: output.task.id,
    category: output.task.category,
    overall,
    answer,
    image,
    component,
    safety,
    schemaValid: output.schemaValid,
    failureFlags: [...new Set(flags)],
    notes,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topCounts(map: Map<string, number>, limit: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function diagnostic(output: HarnessOutput): ChatDiagnostics {
  return output.response?._autoresearch ?? {};
}

function averageJudgeSection(section?: Record<string, number>): number | null {
  if (!section) return null;
  const values = Object.values(section).filter((value) => Number.isFinite(value));
  return values.length ? clampScore(average(values)) : null;
}

async function runJudge(outputs: HarnessOutput[], scores: TaskScore[]): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const client = new OpenAI();
  const judgePath = join(runDir, 'judge.jsonl');
  writeFileSync(judgePath, '');

  for (const [index, output] of outputs.entries()) {
    try {
      const completion = await client.chat.completions.create({
        model: process.env.AUTORESEARCH_JUDGE_MODEL || 'gpt-5.5',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a strict evaluator for Clitronic. Grade only from the provided task, response, image metadata, and rubric. Return JSON only. Do not invent visual facts not present in metadata.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              rubric,
              task: output.task,
              response: output.response,
              imageSearch: output.imageSearch,
              requiredShape: {
                answer: {
                  relevance_to_user_intent: '0-5',
                  domain_specificity: '0-5',
                  practical_actionability: '0-5',
                  concrete_parts_materials_tools: '0-5',
                  correct_ui_component_choice: '0-5',
                  technical_correctness: '0-5',
                  safety_and_code_awareness: '0-5',
                  avoidance_of_generic_advice: '0-5',
                  clarity_and_structure: '0-5',
                },
                images: {
                  image_query_specificity: '0-5',
                  image_relevance_to_prompt: '0-5',
                  image_practical_usefulness: '0-5',
                  image_diversity: '0-5',
                  image_quality_metadata: '0-5',
                  absence_of_generic_stock_images: '0-5',
                  answer_image_alignment: '0-5',
                },
                failure_flags: [],
                notes: 'short audit note',
              },
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const judge = JSON.parse(raw) as JudgeResult;
      appendFileSync(judgePath, `${JSON.stringify({ taskId: output.task.id, judge })}\n`);

      const answerJudge = averageJudgeSection(judge.answer);
      const imageJudge = averageJudgeSection(judge.images);
      if (answerJudge !== null) {
        scores[index]!.answer = clampScore((scores[index]!.answer + answerJudge) / 2);
      }
      if (imageJudge !== null && isImageExpected(output.task)) {
        scores[index]!.image = clampScore((scores[index]!.image + imageJudge) / 2);
      }
      scores[index]!.component =
        judge.answer?.correct_ui_component_choice !== undefined
          ? clampScore((scores[index]!.component + judge.answer.correct_ui_component_choice) / 2)
          : scores[index]!.component;
      scores[index]!.safety =
        judge.answer?.safety_and_code_awareness !== undefined
          ? clampScore((scores[index]!.safety + judge.answer.safety_and_code_awareness) / 2)
          : scores[index]!.safety;
      scores[index]!.overall = clampScore(
        scores[index]!.answer * 0.42 +
          scores[index]!.image * 0.28 +
          scores[index]!.component * 0.15 +
          scores[index]!.safety * 0.15
      );
      scores[index]!.judge = judge;
      if (judge.failure_flags?.length) {
        scores[index]!.failureFlags = [
          ...new Set([...scores[index]!.failureFlags, ...judge.failure_flags]),
        ];
      }
    } catch (error) {
      appendFileSync(
        judgePath,
        `${JSON.stringify({
          taskId: output.task.id,
          skipped: true,
          error: error instanceof Error ? error.message : String(error),
        })}\n`
      );
    }
  }
}

async function main() {
  const outputs = readJsonl<HarnessOutput>(outputsPath);
  const scores = outputs.map(deterministicScore);
  await runJudge(outputs, scores);

  const tasksRun = outputs.length;
  const tasksFailed = outputs.filter((output) => output.status >= 400 || output.error).length;
  const imageExpectedOutputs = outputs.filter((output) => isImageExpected(output.task));
  const imageExpectedScores = scores.filter((score) =>
    imageExpectedOutputs.some((output) => output.task.id === score.id)
  );
  const allFlags = scores.flatMap((score) => score.failureFlags);
  const failureCounts = new Map<string, number>();
  for (const flag of allFlags) {
    failureCounts.set(flag, (failureCounts.get(flag) ?? 0) + 1);
  }
  const diagnostics = outputs.map(diagnostic);
  const modelOutputs = diagnostics.filter((item) => item.raw_model_output_present === true);
  const validationAttempts = diagnostics.filter((item) => item.model_validation_success !== null);
  const fallbackOutputs = diagnostics.filter(
    (item) => item.fallback_kind && item.fallback_kind !== 'none'
  );
  const validatorIssuePaths = new Map<string, number>();
  const validatorIssueMessages = new Map<string, number>();
  const invalidComponentCounts = new Map<string, { invalid: number; total: number }>();
  const categoryFallbackCounts = new Map<string, { fallback: number; total: number }>();

  for (const output of outputs) {
    const item = diagnostic(output);
    const category = output.task.category;
    const categoryCount = categoryFallbackCounts.get(category) ?? { fallback: 0, total: 0 };
    categoryCount.total += 1;
    if (item.fallback_kind && item.fallback_kind !== 'none') categoryCount.fallback += 1;
    categoryFallbackCounts.set(category, categoryCount);

    if (item.model_validation_success !== null) {
      const component = item.normalized_component ?? '(none)';
      const componentCount = invalidComponentCounts.get(component) ?? { invalid: 0, total: 0 };
      componentCount.total += 1;
      if (item.model_validation_success === false) componentCount.invalid += 1;
      invalidComponentCounts.set(component, componentCount);
    }

    for (const issue of item.validator_issues ?? []) {
      incrementCount(validatorIssuePaths, issue.path ?? '(unknown)');
      incrementCount(validatorIssueMessages, issue.message ?? '(unknown)');
    }
  }

  const invalidComponentRateByComponent = Object.fromEntries(
    [...invalidComponentCounts.entries()]
      .sort((a, b) => b[1].invalid - a[1].invalid || a[0].localeCompare(b[0]))
      .map(([component, value]) => [
        component,
        {
          invalid: value.invalid,
          total: value.total,
          rate: rate(value.invalid, value.total),
        },
      ])
  );
  const fallbackRateByTaskCategory = Object.fromEntries(
    [...categoryFallbackCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, value]) => [
        category,
        {
          fallback: value.fallback,
          total: value.total,
          rate: rate(value.fallback, value.total),
        },
      ])
  );

  const summary = {
    overall_score: average(scores.map((score) => score.overall)),
    answer_quality_score: average(scores.map((score) => score.answer)),
    image_quality_score: imageExpectedScores.length
      ? average(imageExpectedScores.map((score) => score.image))
      : 5,
    component_selection_score: average(scores.map((score) => score.component)),
    safety_score: average(scores.map((score) => score.safety)),
    generic_answer_rate: rate(
      scores.filter((score) => score.failureFlags.includes('generic_answer')).length,
      tasksRun
    ),
    shallow_image_query_rate: rate(
      scores.filter((score) => score.failureFlags.includes('shallow_image_query')).length,
      imageExpectedScores.length
    ),
    irrelevant_image_rate: rate(
      scores.filter((score) => score.failureFlags.includes('irrelevant_images')).length,
      imageExpectedScores.length
    ),
    duplicate_image_rate: rate(
      scores.filter((score) => score.failureFlags.includes('duplicate_images')).length,
      imageExpectedScores.length
    ),
    broken_image_rate: rate(
      scores.filter((score) => score.failureFlags.includes('broken_image_url')).length,
      imageExpectedScores.length
    ),
    schema_valid_rate: rate(outputs.filter((output) => output.schemaValid).length, tasksRun),
    model_parse_success_rate: rate(
      modelOutputs.filter((item) => item.model_json_parse_success === true).length,
      modelOutputs.length
    ),
    model_validation_success_rate: rate(
      validationAttempts.filter((item) => item.model_validation_success === true).length,
      validationAttempts.length
    ),
    final_response_schema_valid_rate: rate(
      outputs.filter((output) => output.schemaValid).length,
      tasksRun
    ),
    fallback_rate: rate(fallbackOutputs.length, tasksRun),
    render_fallback_rate: rate(
      diagnostics.filter((item) => item.fallback_kind === 'render_fallback').length,
      tasksRun
    ),
    recovered_text_rate: rate(
      diagnostics.filter((item) => item.fallback_kind === 'recovered_text').length,
      tasksRun
    ),
    forced_photo_fast_path_rate: rate(
      diagnostics.filter((item) => item.fallback_kind === 'forced_photo').length,
      tasksRun
    ),
    top_validator_issue_paths: topCounts(validatorIssuePaths, 10),
    top_validator_issue_messages: topCounts(validatorIssueMessages, 10),
    invalid_component_rate_by_component: invalidComponentRateByComponent,
    fallback_rate_by_task_category: fallbackRateByTaskCategory,
    tasks_run: tasksRun,
    tasks_failed: tasksFailed,
    worst_tasks: scores
      .slice()
      .sort((a, b) => a.overall - b.overall)
      .slice(0, 10)
      .map((score) => ({
        id: score.id,
        category: score.category,
        overall: score.overall,
        answer: score.answer,
        image: score.image,
        component: score.component,
        safety: score.safety,
        failureFlags: score.failureFlags,
      })),
    top_failure_modes: [...failureCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([flag, count]) => ({ flag, count })),
    pass: false,
    run_dir: runDir,
    scorer: {
      deterministic: true,
      gpt_judge: Boolean(process.env.OPENAI_API_KEY),
      image_url_http_checks: false,
    },
  };

  summary.pass =
    summary.overall_score >= 4.0 &&
    summary.answer_quality_score >= 4.0 &&
    summary.image_quality_score >= 3.75 &&
    summary.safety_score >= 4.5 &&
    summary.schema_valid_rate >= 1.0 &&
    summary.generic_answer_rate <= 0.15 &&
    summary.shallow_image_query_rate <= 0.2 &&
    summary.irrelevant_image_rate <= 0.2 &&
    summary.duplicate_image_rate <= 0.05;

  mkdirSync(dirname('autoresearch/latest_score.json'), { recursive: true });
  writeFileSync('autoresearch/latest_score.json', `${JSON.stringify(summary, null, 2)}\n`);
  appendFileSync(
    'autoresearch/results.jsonl',
    `${JSON.stringify({ ts: new Date().toISOString(), ...summary })}\n`
  );
  writeFileSync(join(runDir, 'task_scores.json'), `${JSON.stringify(scores, null, 2)}\n`);

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
