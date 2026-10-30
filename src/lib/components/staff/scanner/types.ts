/** The scan result party, shaped by the `scan` action for the wire. */
export interface ScanParty {
	id: string | null;
	guestName: string | null;
	quantity: number | null;
	arrived: number;
	/** Balance due at the venue, already formatted, or null. */
	balance: string | null;
	isComp: boolean;
	dietaryRequirements: string | null;
}
