import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { BaseStack } from '../lib/base-stack.js';
import { loadEnvironmentConfig } from '../lib/environments/index.js';

const budgetEmail = 'budget-recipient';
vi.setConfig({ testTimeout: 15000 });

function createBaseStack() {
  const loaded = loadEnvironmentConfig({ env: 'staging' }, { STEAMX_BUDGET_EMAIL: budgetEmail });
  const app = new App();
  const stack = new BaseStack(app, 'SteamxStagingBase', loaded.config, loaded.budgetEmail, {
    stackName: 'SteamxStagingBase',
    env: { region: loaded.config.region },
  });
  return { stack, template: Template.fromStack(stack) };
}

describe('BaseStack', () => {
  it('creates exactly one named monthly budget with the configured notifications', () => {
    const { template } = createBaseStack();
    template.resourceCountIs('AWS::Budgets::Budget', 1);
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'steamx-staging-budget',
        BudgetLimit: { Amount: 25, Unit: 'USD' },
        TimeUnit: 'MONTHLY',
        BudgetType: 'COST',
      },
      NotificationsWithSubscribers: [
        {
          Notification: {
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 80,
            ThresholdType: 'PERCENTAGE',
          },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: budgetEmail }],
        },
        {
          Notification: {
            NotificationType: 'FORECASTED',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 100,
            ThresholdType: 'PERCENTAGE',
          },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: budgetEmail }],
        },
      ],
    });
  });

  it('applies project and environment tags to the stack', () => {
    const { stack, template } = createBaseStack();
    expect(stack.tags.tagValues()).toMatchObject({
      project: 'steamx',
      environment: 'staging',
    });
    template.hasResourceProperties('AWS::Budgets::Budget', {
      ResourceTags: [
        { Key: 'project', Value: 'steamx' },
        { Key: 'environment', Value: 'staging' },
      ],
    });
  });

  it('rejects environments that are not defined', () => {
    expect(() =>
      loadEnvironmentConfig({ env: 'production' }, { STEAMX_BUDGET_EMAIL: budgetEmail }),
    ).toThrow('only staging is defined');
  });

  it('requires the budget notification email', () => {
    expect(() => loadEnvironmentConfig({ env: 'staging' }, {})).toThrow(
      'STEAMX_BUDGET_EMAIL is required',
    );
  });
});
