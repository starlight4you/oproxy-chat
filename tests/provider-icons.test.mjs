import test from 'node:test';
import assert from 'node:assert/strict';
import { providerForModel } from '../src/provider-icons.js';

test('provider identity follows the model before its compatible endpoint', () => {
  for (const [model, expected] of [
    ['gpt-6.1-sol', 'openai'], ['openai/o3', 'openai'], ['o4-mini', 'openai'],
    ['anthropic/claude-sonnet-4', 'claude'], ['Claude Opus', 'claude'],
    ['deepseek/deepseek-r1', 'deepseek'], ['DeepSeek-V3', 'deepseek'],
    ['gemini-2.5-pro', 'gemini'], ['Qwen3-235B', 'qwen'],
    ['grok-4', 'grok'], ['mistralai/Mixtral-8x7B', 'mistral'],
    ['glm-5.3', 'zhipu'], ['kimi-k3-thinking', 'kimi'], ['MiniMax-m2.5', 'minimax'],
  ]) assert.equal(providerForModel(model, 'Oproxy OpenAI'), expected, model);
  assert.equal(providerForModel('', 'Oproxy Anthropic'), 'claude');
  assert.equal(providerForModel('custom-model', 'Oproxy'), '');
  assert.equal(providerForModel('mygptishmodel', 'Other'), '');
  assert.equal(providerForModel(null, null), '');
});
