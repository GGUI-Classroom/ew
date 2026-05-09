import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(moduleDirectory, '..', 'data');
const legacyDataDirectory = path.join(process.cwd(), 'data');
const stateFile = path.join(dataDirectory, 'state.json');
const legacyStateFile = path.join(legacyDataDirectory, 'state.json');
const defaultState = {
  activeRelays: {},
  bannedUsers: [],
  warnings: {},
  adminRoleIds: [],
  adminUserIds: [],
  guildAdmins: {},
  dispenserLinks: [],
  dispenserLimits: [],
  dispenserUsage: [],
  dispenserPanelMessages: {},
  dispenserPanelMetadata: {},
  moderationRules: {},
  autobanList: [],
  autobanGuilds: {},
  alertReports: [],
};

export async function loadState() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    let rawState;

    try {
      rawState = await readFile(stateFile, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT' || legacyStateFile === stateFile) {
        throw error;
      }

      rawState = await readFile(legacyStateFile, 'utf8');
    }

    const parsedState = JSON.parse(rawState);
    const normalizedState = {
      ...defaultState,
      ...parsedState,
      activeRelays: parsedState.activeRelays ?? {},
      bannedUsers: parsedState.bannedUsers ?? [],
      warnings: parsedState.warnings ?? {},
      adminRoleIds: parsedState.adminRoleIds ?? [],
      adminUserIds: parsedState.adminUserIds ?? parsedState.dispenserAdmins ?? [],
      guildAdmins: parsedState.guildAdmins ?? {},
      dispenserLinks: parsedState.dispenserLinks ?? [],
      dispenserLimits: parsedState.dispenserLimits ?? [],
      dispenserUsage: parsedState.dispenserUsage ?? [],
      dispenserPanelMessages: parsedState.dispenserPanelMessages ?? {},
      dispenserPanelMetadata: parsedState.dispenserPanelMetadata ?? {},
      moderationRules: parsedState.moderationRules ?? {},
      autobanList: parsedState.autobanList ?? [],
      autobanGuilds: parsedState.autobanGuilds ?? {},
      alertReports: parsedState.alertReports ?? [],
    };

    await saveState(normalizedState);
    return normalizedState;
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
