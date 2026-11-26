import { describe, expect, it } from 'vitest';
import { loadEnvironmentConfig } from '../lib/environments/index.js';
import { stagingConfig } from '../lib/environments/staging.js';

describe('loadEnvironmentConfig', () => {
  it('rejects environments that are not configured', () => {
    expect(() =>
      loadEnvironmentConfig(
        stagingConfig,
        { env: 'production' },
        { STEAMX_BUDGET_EMAIL: 'budget-recipient' },
      ),
    ).toThrow('only staging is defined');
  });

  it('requires the budget notification email', () => {
    expect(() => loadEnvironmentConfig(stagingConfig, { env: 'staging' }, {})).toThrow(
      'STEAMX_BUDGET_EMAIL is required',
    );
  });

  it('uses the supplied environment configuration and region override', () => {
    const config = {
      ...stagingConfig,
      region: 'us-west-2',
      domainName: 'example.com',
      appOrigin: 'https://learn.example.com',
    };
    const loaded = loadEnvironmentConfig(
      config,
      { env: 'staging', region: 'eu-west-1' },
      { STEAMX_BUDGET_EMAIL: ' budget-recipient ' },
    );

    expect(loaded.config).toMatchObject({
      ...config,
      region: 'eu-west-1',
    });
    expect(loaded.config).not.toBe(config);
    expect(loaded.budgetEmail).toBe('budget-recipient');
  });
});
