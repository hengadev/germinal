import { describe, it, expect } from 'vitest';
import { joinName, nameColumns, nameFromInput, nameOf, splitName } from '../../../src/lib/utils/person-name';

describe('person names', () => {
	it('joins the parts, skipping an empty one', () => {
		expect(joinName('Margaux', 'Ferrand')).toBe('Margaux Ferrand');
		expect(joinName(' Margaux ', '')).toBe('Margaux');
		expect(joinName(null, 'Dupont')).toBe('Dupont');
		expect(joinName('', undefined)).toBe('');
	});

	it('splits a full name at its first space, as migration 0056 did', () => {
		expect(splitName('Jean-Pierre de la Tour')).toEqual({ firstName: 'Jean-Pierre', lastName: 'de la Tour' });
		expect(splitName('  Cher ')).toEqual({ firstName: 'Cher', lastName: '' });
		expect(splitName('Ana  María López')).toEqual({ firstName: 'Ana', lastName: 'María López' });
		expect(splitName(null)).toEqual({ firstName: '', lastName: '' });
	});

	it('reads the two columns, else splits the old full name', () => {
		expect(nameOf({ firstName: 'Inès', lastName: 'Morel', fullName: 'whatever' })).toEqual({ firstName: 'Inès', lastName: 'Morel' });
		expect(nameOf({ firstName: 'Inès', lastName: null, fullName: 'Inès Morel' })).toEqual({ firstName: 'Inès', lastName: '' });
		expect(nameOf({ firstName: null, lastName: null, fullName: 'Inès Morel' })).toEqual({ firstName: 'Inès', lastName: 'Morel' });
	});

	it('takes first and last name from a form, or splits an old client’s name', () => {
		expect(nameFromInput({ firstName: ' Paul ', lastName: ' Arnaud ' })).toEqual({ firstName: 'Paul', lastName: 'Arnaud' });
		expect(nameFromInput({ name: 'Paul Arnaud' })).toEqual({ firstName: 'Paul', lastName: 'Arnaud' });
		expect(nameFromInput({ firstName: 'Paul', name: 'Ignored Name' })).toEqual({ firstName: 'Paul', lastName: '' });
	});

	it('gives the columns to write: the parts, capped, and the full name', () => {
		expect(nameColumns({ firstName: 'Antoine', lastName: 'Lacaze' })).toEqual({ firstName: 'Antoine', lastName: 'Lacaze', fullName: 'Antoine Lacaze' });
		expect(nameColumns({ firstName: 'a'.repeat(120), lastName: 'B' }).firstName).toHaveLength(100);
	});
});
