// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}

		interface Locals {
			user: {
				id: string;
				email: string;
				role: string;
				createdAt: Date;
			} | null;
			isAdminDomain: boolean;
		}

		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
