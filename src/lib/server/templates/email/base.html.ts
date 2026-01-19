export interface EmailTemplate {
	subject: string;
 	preheader: string;
 	content: string;
 	footer: string;
}

export const BASE_TEMPLATE: EmailTemplate = {
	subject: 'Germinal',
	preheader: `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc;">
		`,
	content: `
			<div style="padding: 20px;">
	`,
	footer: `
		<div style="background-color: #f3f4f6; padding: 20px; text-align: center;">
			<p style="color: #6b7280; margin: 0;">&copy; 2025 Germinal. All rights reserved.</p>
		</div>
	</div>
	`,
};

export function wrapEmailContent(content: string): string {
	return `${BASE_TEMPLATE.preheader}${content}${BASE_TEMPLATE.footer}`;
}
