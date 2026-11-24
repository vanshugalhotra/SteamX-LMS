import { Stack, Tags, aws_budgets as budgets } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { EnvConfig } from './environments/types.js';

export class BaseStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    budgetEmail: string,
    props: StackProps = {},
  ) {
    super(scope, id, props);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('environment', config.envName);

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `steamx-${config.envName}-budget`,
        budgetLimit: {
          amount: config.monthlyBudgetUsd,
          unit: 'USD',
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: budgetEmail }],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: budgetEmail }],
        },
      ],
      resourceTags: [
        { key: 'project', value: 'steamx' },
        { key: 'environment', value: config.envName },
      ],
    });
  }
}
