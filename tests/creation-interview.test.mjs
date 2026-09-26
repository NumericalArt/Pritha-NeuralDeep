import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATION_INTERVIEW_ROUNDS, completeCreationBrief, creationBriefPrompt, readCreationInterview } from '../scripts/neuraldeep/creation-preparation.mjs';
import { creationAssistantDialogue } from '../scripts/neuraldeep/creation-dialogue.mjs';

const block = value => `Понял задачу так: локальный разбор заметок.\n\n1. Кто основной пользователь?\n\n\`\`\`pritha-interview-json\n${JSON.stringify(value)}\n\`\`\``;
const interview = { schemaVersion: 1, draft: 'Локальное веб-приложение, которое извлекает задачи из заметок встреч.',
  assumptions: ['Один пользователь на этом Mac'],
  questions: [{ id: 'q1', question: 'Нужна ли выгрузка в календарь?', why: 'Меняет внешние зависимости и права.', options: ['нет', 'ICS-файл'], default: 'нет' }] };
const job = (preparation = {}) => ({ jobId: 'creation_fixture', generation: 1, status: 'running', autoContinue: true, blocker: null, preparation: { generation: 1, ...preparation } });

test('an interview round records questions with defaults and waits for the operator', () => {
  const parsed = readCreationInterview(block(interview));
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.interview.questions[0].default, 'нет');
  const next = completeCreationBrief(job(), block(interview), { turnId: 'turn_one' });
  assert.equal(next.status, 'waiting_input');
  assert.equal(next.autoContinue, false);
  assert.equal(next.preparation.interview.rounds, 1);
  assert.equal(next.preparation.interview.questions[0].question, 'Нужна ли выгрузка в календарь?');
  assert.equal(next.contract, undefined, 'questions never create a contract');
  assert.doesNotMatch(creationAssistantDialogue(block(interview)), /pritha-interview-json/, 'structured questions travel in the packet, not twice in the dialogue');
  assert.match(creationAssistantDialogue(block(interview)), /Кто основной пользователь/);
});

test('questions written on the fence line after a colon are still recognized (kimi-k2.6, 2026-09-26)', () => {
  const inline = 'Уточните, пожалуйста:\n\n1. Нужна ли выгрузка?\n\n```pritha-interview-json: ' + JSON.stringify(interview) + '\n```';
  const next = completeCreationBrief(job(), inline, { turnId: 'turn_inline' });
  assert.equal(next.status, 'waiting_input');
  assert.equal(next.preparation.interview.questions.length, 1);
  assert.doesNotMatch(creationAssistantDialogue(inline), /pritha-interview-json/);
});

test('invalid questions and exhausted rounds ask for the final brief instead of waiting', () => {
  for (const bad of [{ ...interview, questions: [] }, { ...interview, questions: [{ question: 'Без обоснования?' }] },
    { ...interview, questions: Array.from({ length: 6 }, (_, i) => ({ ...interview.questions[0], id: `q${i}` })) }]) {
    assert.ok(readCreationInterview(block(bad)).issues.length, JSON.stringify(bad.questions).slice(0, 60));
  }
  const exhausted = completeCreationBrief(job({ interview: { rounds: CREATION_INTERVIEW_ROUNDS, questions: [], assumptions: [], draft: '' } }), block(interview), { turnId: 'turn_four' });
  assert.equal(exhausted.status, 'pending', 'one structural repair turn is allowed');
  assert.match(exhausted.preparation.briefErrors[0], /Interview rounds are exhausted/);
  assert.equal(exhausted.preparation.interview.rounds, CREATION_INTERVIEW_ROUNDS);
});

test('the brief prompt asks material product questions and states the remaining rounds', () => {
  const fixture = { agentId: 'fixture-app', target: '/tmp/fixture-app', preparation: { interview: { rounds: 1 } } };
  const prompt = creationBriefPrompt(fixture);
  assert.match(prompt, /proposal-first/);
  assert.match(prompt, /Interview rounds used: 1 of 3/);
  assert.match(prompt, /pritha-interview-json/);
  assert.match(prompt, /never ask about them/);
  assert.match(creationBriefPrompt({ ...fixture, preparation: { interview: { rounds: 3 } } }), /No rounds remain: return the final brief/);
});
