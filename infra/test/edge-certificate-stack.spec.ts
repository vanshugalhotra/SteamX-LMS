import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { EdgeCertificateStack } from '../lib/edge-certificate-stack.js';
import { stagingConfig } from '../lib/environments/staging.js';

vi.setConfig({ testTimeout: 30000 });

describe('EdgeCertificateStack', () => {
  it('creates a DNS-validated certificate for the app hostname in us-east-1', () => {
    const account = '123456789012';
    const app = new App({
      context: {
        'hosted-zone:account=123456789012:domainName=version26.in:region=us-east-1': {
          Id: 'Z1234567890',
          Name: 'version26.in',
        },
      },
    });
    const stack = new EdgeCertificateStack(app, 'SteamxStagingCert', stagingConfig, {
      stackName: 'SteamxStagingCert',
      env: { account, region: 'us-east-1' },
      crossRegionReferences: true,
    });
    const template = Template.fromStack(stack);

    expect(stack.region).toBe('us-east-1');
    expect(stack.tags.tagValues()).toMatchObject({
      project: 'steamx',
      environment: 'staging',
    });
    template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'learn.version26.in',
      DomainValidationOptions: [{ DomainName: 'learn.version26.in', HostedZoneId: 'Z1234567890' }],
      ValidationMethod: 'DNS',
    });
  });
});
