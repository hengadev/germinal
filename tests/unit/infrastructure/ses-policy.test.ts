// @vitest-environment node
//
// Static tripwire for the SES sending policy's scope (issue 028, PRD M5):
// the app's IAM policy may allow sending as the Germinal domain identity
// (and its configuration set) only — never `Resource: "*"`, which would let
// the app key send as any verified identity in the AWS account. Terraform
// itself validates structure; this pins the least-privilege contract.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sesTf = readFileSync(
	join(repoRoot, 'infrastructure/terraform/ses.tf'),
	'utf8'
);

/** The statements of the ses_send policy, as source text. */
const policyBody = sesTf.slice(
	sesTf.indexOf('resource "aws_iam_policy" "ses_send"'),
	sesTf.indexOf('resource "aws_iam_user_policy_attachment" "ses_send_attach"')
);

describe('terraform ses.tf: sending policy scoped to the Germinal identity', () => {
	it('never grants a SES action on Resource "*"', () => {
		expect(policyBody).not.toContain('Resource = "*"');
		expect(policyBody).not.toMatch(/Resource\s*=\s*\*"/);
	});

	it('scopes SendEmail/SendRawEmail to the domain identity ARN and its configuration set', () => {
		expect(policyBody).toContain('aws_ses_domain_identity.main.arn');
		// A send that names the configuration set is authorized against BOTH
		// ARNs, so the config set joins the Resource list.
		expect(policyBody).toMatch(
			/arn:aws:ses:\$\{var\.aws_region\}:\$\{data\.aws_caller_identity\.current\.account_id\}:configuration-set\//
		);
	});

	it('resolves the account id with a caller-identity data source, not a literal', () => {
		expect(sesTf).toContain('data "aws_caller_identity" "current"');
		expect(policyBody).not.toMatch(/\b\d{12}\b/);
	});
});
