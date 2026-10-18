/** Reads the one-time admin setup credentials from the process environment. */
import { FirstAdminError, type FirstAdminInput } from '../types/first-admin.js';

/** Fails early with a setup error when either required credential is missing. */
export function readFirstAdminInput(environment: NodeJS.ProcessEnv): FirstAdminInput {
  const steamxId = environment.ADMIN_STEAMX_ID;
  if (!steamxId) {
    throw new FirstAdminError('ADMIN_STEAMX_ID is required.');
  }

  const password = environment.ADMIN_PASSWORD;
  if (!password) {
    throw new FirstAdminError('ADMIN_PASSWORD is required.');
  }

  return {
    steamxId,
    password,
    name: environment.ADMIN_NAME,
  };
}
