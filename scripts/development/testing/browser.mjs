import { chromium } from '@playwright/test';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// This worker owns one browser and profile. Its stdout is an NDJSON protocol;
// never forward Playwright diagnostics, page content, or account information.
const origin = 'http://127.0.0.1:5173';
const repository = fileURLToPath(new URL('../../..', import.meta.url));
const profileRoot = resolve(repository, '.local', 'testing');
const errors = {
  arguments: 'Use --profile with a private directory under .local/testing; --headless is optional.',
  browser: 'Could not start the private Chrome or Edge browser. Check the launcher log and close any other launcher using this profile.',
  closed: 'The testing browser was closed.',
  local: 'Return the managed tab to the local ChordViewer application before playing MIDI.',
  dialog: 'Finish or close the open application dialog, then try again.',
  sheet: 'Open or create a sheet in the web application, then try again.',
  loopback: 'LoopBe MIDI input is unavailable. Check that LoopBe is installed and enabled, then try again.',
  prepare: 'Could not enable web MIDI. Keep the managed tab visible, allow MIDI access, then try again.',
  startup: 'The local web application did not become ready.',
  command: 'Unknown or invalid browser worker command.',
};

class WorkerError extends Error {}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function inside(parent, candidate) {
  const path = relative(parent, candidate);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function options() {
  const args = process.argv.slice(2);
  let profile;
  let headless = false;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--headless' && !headless) headless = true;
    else if (argument === '--profile' && !profile && args.length) profile = args.shift();
    else throw new WorkerError(errors.arguments);
  }
  if (!profile || !isAbsolute(profile) || !inside(profileRoot, resolve(profile))) {
    throw new WorkerError(errors.arguments);
  }
  // Reject existing junctions before creating anything below them.
  let parent = repository;
  for (const segment of relative(repository, resolve(profile)).split(sep)) {
    parent = resolve(parent, segment);
    try {
      if ((await lstat(parent)).isSymbolicLink()) throw new WorkerError(errors.arguments);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  // Check canonical paths too: a junction must not turn a private testing
  // profile into a user's personal browser profile.
  await mkdir(profileRoot, { recursive: true });
  const actualRoot = await realpath(profileRoot);
  if (!inside(await realpath(repository), actualRoot)) throw new WorkerError(errors.arguments);
  await mkdir(profile, { recursive: true });
  const actualProfile = await realpath(profile);
  if (!inside(actualRoot, actualProfile)) throw new WorkerError(errors.arguments);
  return { profile: actualProfile, headless };
}

let context;
let page;
let stopping = false;
let reader;
let closing;

async function stop() {
  stopping = true;
  reader?.close();
  // Closing the context also releases all real MIDI handles, including a
  // permission request that happens to complete during shutdown.
  if (context) {
    closing ||= context.close().catch(() => {});
    await closing;
  }
  process.stdin.destroy();
}

function requireLocal() {
  if (!page || page.isClosed()) throw new WorkerError(errors.closed);
  if (new URL(page.url()).origin !== origin) throw new WorkerError(errors.local);
}

async function midiStatus() {
  requireLocal();
  return page.evaluate(() => {
    const select = document.querySelector('.midi-card select');
    const selected = select?.value || '';
    const accesses = window.__chordViewerTestingMidi || new Set();
    const connected = [...accesses].some((access) => {
      const input = access.inputs.get(selected);
      return input?.connection === 'open' && input.state === 'connected'
        && /loopbe/i.test(input.name || '') && typeof input.onmidimessage === 'function';
    });
    const notes = (testId) => {
      const value = document.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() || 'None';
      // Return only the monitor's bounded musical notation, never arbitrary
      // page text that could contain account data after a UI change.
      return value === 'None' || /^[A-G][♯♭]?-?\d+ · ch \d+( \/ [A-G][♯♭]?-?\d+ · ch \d+)*$/.test(value)
        ? value.slice(0, 2048) : 'Unavailable';
    };
    const messageText = [...document.querySelectorAll('.midi-card .small')]
      .map((element) => element.textContent || '').find((value) => /· \d+ messages/.test(value));
    const messages = Number(messageText?.match(/· (\d+) messages/)?.[1] || 0);
    return { midiReady: connected && !document.hidden, held: notes('held-notes'), sounding: notes('sounding-notes'), messages };
  });
}

async function prepare() {
  requireLocal();
  await page.bringToFront();
  await page.waitForFunction(() => !document.hidden, null, { timeout: 5_000 });
  requireLocal();
  if (await page.locator('dialog[open]').count()) throw new WorkerError(errors.dialog);
  const monitor = page.getByRole('region', { name: 'Live MIDI', exact: true });
  if (!await monitor.isVisible()) {
    // Library hides an existing workspace without unmounting its draft.
    // Unsigned users can safely enter the example. An account with no open
    // sheet needs the user to choose one; never create or discard their data.
    const existingWorkspace = await page.locator('.workspace-container').count();
    const sampleAvailable = await page.getByRole('button', { name: 'Explore the score preview ↗', exact: true }).isVisible();
    if (!existingWorkspace && !sampleAvailable) throw new WorkerError(errors.sheet);
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Create', exact: true }).click();
  }
  requireLocal();
  if ((await midiStatus()).midiReady) return midiStatus();
  await monitor.getByRole('button', { name: 'Enable MIDI', exact: true }).click();
  const input = monitor.getByRole('combobox', { name: 'MIDI input', exact: true });
  await input.waitFor({ state: 'visible', timeout: 8_000 });
  requireLocal();
  const loopback = await input.locator('option').evaluateAll((elements) => elements
    .find((element) => /loopbe/i.test(element.textContent || ''))?.value);
  if (!loopback) throw new WorkerError(errors.loopback);
  await input.selectOption(loopback);
  await page.waitForFunction(() => {
    const selected = document.querySelector('.midi-card select')?.value;
    return !document.hidden && [...(window.__chordViewerTestingMidi || [])].some((access) => {
      const input = access.inputs.get(selected);
      return input?.connection === 'open' && input.state === 'connected'
        && /loopbe/i.test(input.name || '') && typeof input.onmidimessage === 'function';
    });
  }, null, { timeout: 10_000 });
  return midiStatus();
}

async function launch(settings) {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launchPersistentContext(settings.profile, {
        channel,
        headless: settings.headless,
        viewport: null,
        args: ['--window-size=1360,900'],
        timeout: 30_000,
      });
    } catch {
      // Branded Chrome can be absent; Edge is the supported Windows fallback.
    }
  }
  throw new WorkerError(errors.browser);
}

async function main() {
  reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const commands = reader[Symbol.asyncIterator]();
  reader.once('close', () => void stop());
  const settings = await options();
  if (stopping) return;
  context = await launch(settings);
  if (stopping) return;
  context.setDefaultTimeout(8_000);
  context.once('close', () => {
    if (!stopping) {
      emit({ event: 'closed' });
      process.exitCode = 1;
      void stop();
    }
  });
  await context.grantPermissions(['midi', 'midi-sysex'], { origin });
  await context.addInitScript(({ appOrigin }) => {
    if (location.origin !== appOrigin || !navigator.requestMIDIAccess) return;
    const request = navigator.requestMIDIAccess.bind(navigator);
    const accesses = new Set();
    Object.defineProperty(window, '__chordViewerTestingMidi', { value: accesses });
    navigator.requestMIDIAccess = async (...args) => {
      const access = await request(...args);
      accesses.add(access);
      return access;
    };
  }, { appOrigin: origin });
  // A persistent profile preserves account cookies, but each launch owns just
  // one app page. No personal browser profile or existing browser is attached.
  page = context.pages()[0] || await context.newPage();
  for (const extra of context.pages().slice(1)) await extra.close();
  page.once('close', () => {
    if (!stopping) {
      emit({ event: 'closed' });
      process.exitCode = 1;
      void stop();
    }
  });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Create', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('nav[aria-label="Main navigation"] button')?.disabled);

  let initial;
  try {
    initial = await prepare();
  } catch (error) {
    initial = { midiReady: false, warning: error instanceof WorkerError ? error.message : errors.prepare };
  }
  if (stopping) return;
  emit({ event: 'ready', ...initial });
  for await (const line of commands) {
    if (stopping) break;
    let command;
    try {
      if (line.length > 4096) throw new WorkerError(errors.command);
      command = JSON.parse(line);
      if (!command || !['prepare', 'status', 'stop'].includes(command.action)
        || !(Number.isSafeInteger(command.id) || (typeof command.id === 'string' && /^[\w-]{1,64}$/.test(command.id)))) {
        throw new WorkerError(errors.command);
      }
      if (command.action === 'stop') {
        emit({ id: command.id, ok: true });
        break;
      }
      const result = command.action === 'prepare' ? await prepare() : await midiStatus();
      emit({ id: command.id, ok: true, ...result });
    } catch (error) {
      if (stopping) break;
      const id = Number.isSafeInteger(command?.id) || (typeof command?.id === 'string' && /^[\w-]{1,64}$/.test(command.id))
        ? command.id : null;
      emit({ id, ok: false, error: error instanceof WorkerError ? error.message : errors.prepare });
    }
  }
}

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
// EOF can arrive during startup before the readline interface exists.
process.stdin.once('end', () => void stop());
process.stdout.on('error', () => void stop());

try {
  await main();
} catch (error) {
  if (!stopping) {
    emit({ event: 'error', error: error instanceof WorkerError ? error.message : errors.startup });
    process.exitCode = 1;
  }
} finally {
  await stop();
}
