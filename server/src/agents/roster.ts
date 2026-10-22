import type { Appearance } from '../../../shared/events.ts';

export const BOSS_ID = 'boss';

export const BOSS_APPEARANCE: Appearance = {
  skin: '#f1c27d',
  hair: '#2b1d14',
  hairStyle: 'short',
  shirt: '#1f2433',
  pants: '#161a24',
  accessory: 'tie',
};

/** Each QA hire gets a stable name, look and personality nudge. */
export const QA_ROSTER: Array<{ name: string; trait: string; appearance: Appearance }> = [
  {
    name: 'Lucy',
    trait: 'meticulous about forms, validation and edge-case inputs',
    appearance: { skin: '#e0ac69', hair: '#5a2d0c', hairStyle: 'long', shirt: '#e85d75', pants: '#2d3a5c', accessory: 'glasses' },
  },
  {
    name: 'Matt',
    trait: 'obsessed with navigation flows, links and broken states',
    appearance: { skin: '#c68642', hair: '#111111', hairStyle: 'short', shirt: '#3fa7d6', pants: '#3b3b3b', accessory: 'headphones' },
  },
  {
    name: 'Val',
    trait: 'focused on accessibility, keyboard navigation and contrast',
    appearance: { skin: '#ffdbac', hair: '#b5651d', hairStyle: 'bun', shirt: '#59cd90', pants: '#24304a' },
  },
  {
    name: 'Jack',
    trait: 'loves responsive layouts and visual regressions',
    appearance: { skin: '#8d5524', hair: '#1b1b1b', hairStyle: 'curly', shirt: '#fac05e', pants: '#41365e' },
  },
  {
    name: 'Sophie',
    trait: 'hunts console errors, network failures and performance smells',
    appearance: { skin: '#f1c27d', hair: '#e8c872', hairStyle: 'long', shirt: '#9b5de5', pants: '#1f2a44', accessory: 'glasses' },
  },
  {
    name: 'Tom',
    trait: 'thinks like a confused first-time user, great at UX and copy issues',
    appearance: { skin: '#e0ac69', hair: '#7a7a7a', hairStyle: 'bald', shirt: '#f15bb5', pants: '#2f2f2f', accessory: 'headphones' },
  },
];
