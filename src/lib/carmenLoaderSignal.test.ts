import { afterEach, beforeEach, expect, test } from "vitest";
import {
  __resetCarmenLoaderSignalForTests,
  cancelCarmenFadeOutGhosts,
  carmenSceneJustEnded,
  getCarmenLoaderSnapshot,
  registerCarmenFadeOutCanceler,
  registerCarmenScene,
  registerCarmenWait,
  shouldFadeRouteContent,
  wouldLegacyEagerSpawnGhost,
} from "./carmenLoaderSignal.ts";

beforeEach(() => {
  __resetCarmenLoaderSignalForTests();
});

afterEach(() => {
  __resetCarmenLoaderSignalForTests();
});

/**
 * Reproduce Suspense fallback → page CarmenLoadingScreen hand-off.
 * Pre-fix: ghost stays while the continued scene mounts (jump/flicker).
 * Post-fix: registering the page scene cancels the ghost.
 */
test("scene hand-off cancels the fade-out ghost", () => {
  const releaseSuspense = registerCarmenScene();
  let ghostAlive = true;
  registerCarmenFadeOutCanceler(() => {
    ghostAlive = false;
  });

  releaseSuspense();
  // Pre-fix eager path would spawn here (idle snapshot during the gap).
  expect(wouldLegacyEagerSpawnGhost()).toBe(true);
  expect(ghostAlive).toBe(true);
  expect(carmenSceneJustEnded()).toBe(true);

  const releasePage = registerCarmenScene();
  expect(ghostAlive).toBe(false);
  expect(getCarmenLoaderSnapshot().scenes).toBe(1);
  releasePage();
});

test("scene→content dissolve keeps the ghost (nothing cancels it)", () => {
  const release = registerCarmenScene();
  let ghostAlive = true;
  registerCarmenFadeOutCanceler(() => {
    ghostAlive = false;
  });
  release();
  expect(ghostAlive).toBe(true);
  expect(cancelCarmenFadeOutGhosts()).toBe(1);
  expect(ghostAlive).toBe(false);
});

test("wait registration also cancels a pending ghost", () => {
  const release = registerCarmenScene();
  let ghostAlive = true;
  registerCarmenFadeOutCanceler(() => {
    ghostAlive = false;
  });
  release();
  const wait = registerCarmenWait();
  expect(ghostAlive).toBe(false);
  wait();
});

test("content fade must not run while Carmen is covering the route", () => {
  expect(shouldFadeRouteContent()).toBe(true);

  const wait = registerCarmenWait();
  expect(shouldFadeRouteContent()).toBe(false);
  wait();

  const scene = registerCarmenScene();
  expect(shouldFadeRouteContent()).toBe(false);
  scene();
  expect(shouldFadeRouteContent()).toBe(true);
});

test("continued hand-off window stays open after a scene ends", () => {
  const release = registerCarmenScene();
  release();
  expect(carmenSceneJustEnded()).toBe(true);
  expect(carmenSceneJustEnded(0)).toBe(false);
});

test("wait then scene escalation keeps a single loading moment", () => {
  const releaseWait = registerCarmenWait();
  expect(getCarmenLoaderSnapshot()).toStrictEqual({ waiting: 1, scenes: 0 });
  releaseWait();
  const releaseScene = registerCarmenScene();
  expect(getCarmenLoaderSnapshot()).toStrictEqual({ waiting: 0, scenes: 1 });
  releaseScene();
  expect(getCarmenLoaderSnapshot()).toStrictEqual({ waiting: 0, scenes: 0 });
});
