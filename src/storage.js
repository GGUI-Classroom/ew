import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDirectory = path.join(process.cwd(), 'data');
const stateFile = path.join(dataDirectory, 'state.json');
const defaultState = {
  relayChannelId: null,
  activeRelays: {},
};

export async function loadState() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    const rawState = await readFile(stateFile, 'utf8');
    const parsedState = JSON.parse(rawState);
    return {
      ...defaultState,
      ...parsedState,
      activeRelays: parsedState.activeRelays ?? {},
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    await saveState(defaultState);
    return structuredClone(defaultState);
  }
}

export async function saveState(state) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}
