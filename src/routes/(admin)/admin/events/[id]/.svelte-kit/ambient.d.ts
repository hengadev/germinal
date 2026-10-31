
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const SHELL: string;
	export const npm_command: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const COLORTERM: string;
	export const PI_CODING_AGENT: string;
	export const HERDR_PANE_ID: string;
	export const CLAUDE_CODE_CHILD_SESSION: string;
	export const XDG_SESSION_PATH: string;
	export const COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
	export const NVM_INC: string;
	export const HISTCONTROL: string;
	export const TERM_PROGRAM_VERSION: string;
	export const WLR_NO_HARDWARE_CURSORS: string;
	export const DATABASE_URL: string;
	export const AI_AGENT: string;
	export const HISTSIZE: string;
	export const HOSTNAME: string;
	export const CLAUDE_CODE_SESSION_ID: string;
	export const I3SOCK: string;
	export const WEZTERM_CONFIG_DIR: string;
	export const CLAUDE_PID: string;
	export const SSH_AUTH_SOCK: string;
	export const CLAUDE_EFFORT: string;
	export const PI_REASONING_LEVEL: string;
	export const PI_SESSION_FILE: string;
	export const WEZTERM_EXECUTABLE: string;
	export const DESKTOP_SESSION: string;
	export const ANKI_API_KEY: string;
	export const XCURSOR_SIZE: string;
	export const GPG_TTY: string;
	export const EDITOR: string;
	export const GLM_HAIKU_MODEL: string;
	export const XDG_SEAT: string;
	export const PWD: string;
	export const LOGNAME: string;
	export const XDG_SESSION_DESKTOP: string;
	export const XDG_SESSION_TYPE: string;
	export const PNPM_HOME: string;
	export const CLAUDE_CODE_MESSAGING_SOCKET: string;
	export const ORCH_BASELINE: string;
	export const SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const CLAUDECODE: string;
	export const ZAI_API_KEY: string;
	export const HOME: string;
	export const COREPACK_ROOT: string;
	export const LANG: string;
	export const WEZTERM_UNIX_SOCKET: string;
	export const LS_COLORS: string;
	export const _JAVA_AWT_WM_NONREPARENTING: string;
	export const XDG_CURRENT_DESKTOP: string;
	export const CLAUDE_CODE_SESSION_ATTENDED: string;
	export const STARSHIP_SHELL: string;
	export const SWAYSOCK: string;
	export const WAYLAND_DISPLAY: string;
	export const TEST_DATABASE_URL: string;
	export const XDG_SEAT_PATH: string;
	export const PI_PROVIDER: string;
	export const pnpm_config_verify_deps_before_run: string;
	export const WLR_RENDERER: string;
	export const ORCH_SCRIPTS: string;
	export const STARSHIP_SESSION_KEY: string;
	export const STEAM_FRAME_FORCE_CLOSE: string;
	export const PI_MODEL: string;
	export const MOZ_GMP_PATH: string;
	export const NVM_DIR: string;
	export const XDG_ACTIVATION_TOKEN: string;
	export const HERDR_STARTUP_CWD: string;
	export const XDG_SESSION_CLASS: string;
	export const TERM: string;
	export const LESSOPEN: string;
	export const USER: string;
	export const MANPAGER: string;
	export const PI_SESSION_ID: string;
	export const DISPLAY: string;
	export const MISTRAL_API_KEY: string;
	export const SHLVL: string;
	export const NVM_CD_FLAGS: string;
	export const GIT_EDITOR: string;
	export const XDG_VTNR: string;
	export const XDG_SESSION_ID: string;
	export const npm_config_user_agent: string;
	export const WEZTERM_CONFIG_FILE: string;
	export const XDG_RUNTIME_DIR: string;
	export const NODE_PATH: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const DEBUGINFOD_URLS: string;
	export const DEBUGINFOD_IMA_CERT_PATH: string;
	export const GLM_OPUS_MODEL: string;
	export const JOURNAL_STREAM: string;
	export const HERDR_ENV: string;
	export const CLAUDE_CODE_EXECPATH: string;
	export const HERDR_TAB_ID: string;
	export const PATH: string;
	export const __GLX_VENDOR_LIBRARY_NAME: string;
	export const GLM_SONNET_MODEL: string;
	export const GBM_BACKEND: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const HERDR_SOCKET_PATH: string;
	export const HERDR_WORKSPACE_ID: string;
	export const MAIL: string;
	export const NVM_BIN: string;
	export const ZAI_BASE_URL: string;
	export const WEZTERM_PANE: string;
	export const OLDPWD: string;
	export const TERM_PROGRAM: string;
	export const CLAUDE_CODE_MESSAGING_TOKEN: string;
	export const WEZTERM_EXECUTABLE_DIR: string;
	export const NODE_ENV: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		SHELL: string;
		npm_command: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		COLORTERM: string;
		PI_CODING_AGENT: string;
		HERDR_PANE_ID: string;
		CLAUDE_CODE_CHILD_SESSION: string;
		XDG_SESSION_PATH: string;
		COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
		NVM_INC: string;
		HISTCONTROL: string;
		TERM_PROGRAM_VERSION: string;
		WLR_NO_HARDWARE_CURSORS: string;
		DATABASE_URL: string;
		AI_AGENT: string;
		HISTSIZE: string;
		HOSTNAME: string;
		CLAUDE_CODE_SESSION_ID: string;
		I3SOCK: string;
		WEZTERM_CONFIG_DIR: string;
		CLAUDE_PID: string;
		SSH_AUTH_SOCK: string;
		CLAUDE_EFFORT: string;
		PI_REASONING_LEVEL: string;
		PI_SESSION_FILE: string;
		WEZTERM_EXECUTABLE: string;
		DESKTOP_SESSION: string;
		ANKI_API_KEY: string;
		XCURSOR_SIZE: string;
		GPG_TTY: string;
		EDITOR: string;
		GLM_HAIKU_MODEL: string;
		XDG_SEAT: string;
		PWD: string;
		LOGNAME: string;
		XDG_SESSION_DESKTOP: string;
		XDG_SESSION_TYPE: string;
		PNPM_HOME: string;
		CLAUDE_CODE_MESSAGING_SOCKET: string;
		ORCH_BASELINE: string;
		SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS: string;
		NoDefaultCurrentDirectoryInExePath: string;
		CLAUDECODE: string;
		ZAI_API_KEY: string;
		HOME: string;
		COREPACK_ROOT: string;
		LANG: string;
		WEZTERM_UNIX_SOCKET: string;
		LS_COLORS: string;
		_JAVA_AWT_WM_NONREPARENTING: string;
		XDG_CURRENT_DESKTOP: string;
		CLAUDE_CODE_SESSION_ATTENDED: string;
		STARSHIP_SHELL: string;
		SWAYSOCK: string;
		WAYLAND_DISPLAY: string;
		TEST_DATABASE_URL: string;
		XDG_SEAT_PATH: string;
		PI_PROVIDER: string;
		pnpm_config_verify_deps_before_run: string;
		WLR_RENDERER: string;
		ORCH_SCRIPTS: string;
		STARSHIP_SESSION_KEY: string;
		STEAM_FRAME_FORCE_CLOSE: string;
		PI_MODEL: string;
		MOZ_GMP_PATH: string;
		NVM_DIR: string;
		XDG_ACTIVATION_TOKEN: string;
		HERDR_STARTUP_CWD: string;
		XDG_SESSION_CLASS: string;
		TERM: string;
		LESSOPEN: string;
		USER: string;
		MANPAGER: string;
		PI_SESSION_ID: string;
		DISPLAY: string;
		MISTRAL_API_KEY: string;
		SHLVL: string;
		NVM_CD_FLAGS: string;
		GIT_EDITOR: string;
		XDG_VTNR: string;
		XDG_SESSION_ID: string;
		npm_config_user_agent: string;
		WEZTERM_CONFIG_FILE: string;
		XDG_RUNTIME_DIR: string;
		NODE_PATH: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		DEBUGINFOD_URLS: string;
		DEBUGINFOD_IMA_CERT_PATH: string;
		GLM_OPUS_MODEL: string;
		JOURNAL_STREAM: string;
		HERDR_ENV: string;
		CLAUDE_CODE_EXECPATH: string;
		HERDR_TAB_ID: string;
		PATH: string;
		__GLX_VENDOR_LIBRARY_NAME: string;
		GLM_SONNET_MODEL: string;
		GBM_BACKEND: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		HERDR_SOCKET_PATH: string;
		HERDR_WORKSPACE_ID: string;
		MAIL: string;
		NVM_BIN: string;
		ZAI_BASE_URL: string;
		WEZTERM_PANE: string;
		OLDPWD: string;
		TERM_PROGRAM: string;
		CLAUDE_CODE_MESSAGING_TOKEN: string;
		WEZTERM_EXECUTABLE_DIR: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
