import { FirstAdminError, type FirstAdminInput } from '../types/first-admin.js';

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
