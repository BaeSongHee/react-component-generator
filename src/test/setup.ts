import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 최신 Node의 실험적 localStorage 전역이 jsdom의 것을 가려 undefined가 되는 경우가 있다.
// jsdom 윈도우의 localStorage로 명시적으로 덮어 환경과 무관하게 동작시킨다.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: jsdomWindow.localStorage,
  });
} else if (typeof globalThis.localStorage?.clear !== 'function') {
  // 우회 수단이 사라지면 저장소 테스트가 원인 불명으로 깨지므로 즉시 알린다.
  throw new Error('localStorage를 사용할 수 없고 globalThis.jsdom도 없습니다. src/test/setup.ts의 우회 로직을 점검하세요.');
}

// 각 테스트 후 렌더된 DOM을 정리해 테스트 간 격리를 보장한다.
afterEach(() => {
  cleanup();
});
