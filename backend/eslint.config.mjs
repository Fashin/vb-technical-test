import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Flat config for the API.
 *
 * Mirrors `web-app/eslint.config.js` so both packages behave the same, minus
 * the React plugins: this is plain Node. It is deliberately self-contained —
 * the previous version extended a config from outside the repository, which
 * made `npm run lint` fail on every machine but its author's.
 */
export default tseslint.config(
	{ ignores: ['dist', 'build', 'data'] },
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ['**/*.ts'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: globals.node,
		},
		rules: {
			/*
			 * An underscore marks a parameter that exists only to satisfy a
			 * signature — Express recognises an error handler by its four
			 * arguments, so the fourth has to be there whether it is called or
			 * not. The convention was already used in the code; this makes the
			 * linter agree with it.
			 */
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
			],
		},
	},
)
