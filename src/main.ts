import "./styles.css";
import sitesJson from "./data/japan-sites.json";
import configJson from "./data/exam-config.json";
import type { Exam, Question, Site } from "./types";
import { buildExam, grade, randomSeed } from "./exam";

const sites = sitesJson as Site[];
const config = configJson as {
  passScore: number;
  sourceVerifiedAt: string;
};

/** The first version draws only on the Japanese sites, so it is a short set. */
const QUESTION_COUNT = 20;

const app = document.querySelector<HTMLDivElement>("#app")!;

interface State {
  screen: "start" | "exam" | "result";
  exam: Exam | null;
  answers: Map<string, string>;
  index: number;
}

const state: State = { screen: "start", exam: null, answers: new Map(), index: 0 };

// Rendering ------------------------------------------------------------------

function render(): void {
  app.replaceChildren(
    state.screen === "start" ? startScreen() : state.screen === "exam" ? examScreen() : resultScreen(),
  );
  app.querySelector<HTMLElement>("[data-focus]")?.focus();
}

function startScreen(): DocumentFragment {
  const fragment = document.createDocumentFragment();

  fragment.append(
    element("h1", { text: "世界遺産検定3級 模擬試験" }),
    element("p", { class: "lede", text: "日本の世界遺産27件から、毎回異なる問題を組み立てます。" }),
  );

  const meta = element("dl", { class: "meta" });
  for (const [term, value] of [
    ["出題数", `${QUESTION_COUNT}問`],
    ["出題範囲", "日本の世界遺産 全27件"],
    ["合格ライン", `${config.passScore}点（100点換算）`],
    ["採点", "全問に解答してから一括採点"],
  ]) {
    meta.append(element("dt", { text: term! }), element("dd", { text: value! }));
  }
  fragment.append(meta);

  const start = element("button", { class: "button-primary", text: "模擬試験を始める" });
  start.dataset.focus = "";
  start.addEventListener("click", () => {
    state.exam = buildExam(sites, QUESTION_COUNT, randomSeed());
    state.answers = new Map();
    state.index = 0;
    state.screen = "exam";
    render();
  });
  fragment.append(start);

  fragment.append(
    element("aside", {
      class: "notice",
      text:
        "「世界遺産検定」は登録商標（登録第5289275号）です。本ツールは非公式の学習ツールであり、" +
        "NPO法人世界遺産アカデミー、株式会社マイナビおよび世界遺産検定事務局の承認・推奨・監修を受けたものではありません。",
    }),
    element("p", {
      class: "faint",
      text: `試験仕様は公式サイトで${config.sourceVerifiedAt}に確認した内容に基づきます。問題文は本ツールが独自に生成したものです。`,
    }),
  );

  return fragment;
}

function examScreen(): DocumentFragment {
  const exam = state.exam!;
  const question = exam.questions[state.index]!;
  const fragment = document.createDocumentFragment();

  const answered = state.answers.size;
  fragment.append(
    element("div", {
      class: "progress",
      children: [
        element("span", { text: `第${state.index + 1}問 / 全${exam.questions.length}問` }),
        element("span", { text: `解答済み ${answered}問` }),
      ],
    }),
    element("div", {
      class: "track",
      children: [element("div", { style: `width: ${(answered / exam.questions.length) * 100}%` })],
    }),
    element("p", { class: "question", text: question.text }),
    choiceList(question),
  );

  const previous = element("button", { class: "button-quiet", text: "前の問題" });
  previous.disabled = state.index === 0;
  previous.addEventListener("click", () => step(-1));

  const isLast = state.index === exam.questions.length - 1;
  const next = element("button", {
    class: isLast ? "button-primary" : "button-quiet",
    text: isLast ? "採点する" : "次の問題",
  });
  next.addEventListener("click", () => (isLast ? finish() : step(1)));

  fragment.append(
    element("div", { class: "nav", children: [previous, element("span", { class: "spacer" }), next] }),
    element("p", { class: "faint", text: "1〜4キーで選択、Enterで次の問題へ進めます。" }),
  );

  return fragment;
}

function choiceList(question: Question): HTMLElement {
  const fieldset = element("fieldset", { class: "choices" });
  fieldset.append(element("legend", { text: question.text }));

  question.choices.forEach((choice, i) => {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = question.id;
    input.value = choice.key;
    input.checked = state.answers.get(question.id) === choice.key;
    input.addEventListener("change", () => {
      state.answers.set(question.id, choice.key);
      render();
    });

    fieldset.append(
      element("label", {
        class: "choice",
        children: [input, element("span", { class: "index", text: `${i + 1}.` }), element("span", { text: choice.label })],
      }),
    );
  });

  return fieldset;
}

function resultScreen(): DocumentFragment {
  const exam = state.exam!;
  const result = grade(exam, state.answers, config.passScore);
  const fragment = document.createDocumentFragment();

  fragment.append(element("h1", { text: "採点結果" }));

  fragment.append(
    element("div", {
      class: `verdict ${result.passed ? "pass" : "fail"}`,
      children: [
        element("div", { class: "label", text: result.passed ? "◎ 合格ライン到達" : "× 合格ラインに届かず" }),
        element("div", { class: "score", text: `${result.score}点` }),
        element("div", {
          class: "detail",
          text: `${result.total}問中${result.correct}問正解（合格ライン ${config.passScore}点）`,
        }),
      ],
    }),
  );

  if (result.wrong.length > 0) {
    fragment.append(element("h2", { text: `間違えた問題（${result.wrong.length}問）` }));
    const review = element("div", { class: "review" });

    for (const { question, chosen } of result.wrong) {
      const chosenLabel = question.choices.find((c) => c.key === chosen)?.label ?? "無解答";
      const answerLabel = question.choices.find((c) => c.key === question.answerKey)!.label;

      const list = element("dl");
      list.append(
        element("dt", { text: "あなたの解答" }),
        element("dd", { class: "wrong", text: `× ${chosenLabel}` }),
        element("dt", { text: "正解" }),
        element("dd", { class: "right", text: `○ ${answerLabel}` }),
      );

      review.append(
        element("article", {
          children: [
            element("p", { class: "q", text: question.text }),
            list,
            element("p", { class: "explanation", text: question.explanation }),
          ],
        }),
      );
    }
    fragment.append(review);
  }

  const again = element("button", { class: "button-primary", text: "もう一度、別の問題で受ける" });
  again.dataset.focus = "";
  again.addEventListener("click", () => {
    state.screen = "start";
    render();
  });

  fragment.append(
    element("hr", { class: "rule" }),
    again,
    element("p", { class: "faint", text: `この模試のシード値: ${exam.seed}` }),
  );

  return fragment;
}

// Interaction ----------------------------------------------------------------

function step(delta: number): void {
  const exam = state.exam!;
  state.index = Math.min(Math.max(state.index + delta, 0), exam.questions.length - 1);
  render();
}

function finish(): void {
  state.screen = "result";
  window.scrollTo({ top: 0 });
  render();
}

document.addEventListener("keydown", (event) => {
  if (state.screen !== "exam") return;
  const question = state.exam!.questions[state.index]!;

  if (["1", "2", "3", "4"].includes(event.key)) {
    const choice = question.choices[Number(event.key) - 1];
    if (choice) {
      state.answers.set(question.id, choice.key);
      render();
    }
    return;
  }

  if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
    if (state.index === state.exam!.questions.length - 1) finish();
    else step(1);
  }
});

// Helpers --------------------------------------------------------------------

interface ElementOptions {
  class?: string;
  text?: string;
  style?: string;
  children?: (Node | string)[];
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text) node.textContent = options.text;
  if (options.style) node.setAttribute("style", options.style);
  if (options.children) node.append(...options.children);
  return node;
}

render();
