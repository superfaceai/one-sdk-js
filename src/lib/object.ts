/**
 * Recursively descends the record and returns a list of enumerable all keys
 * 
 */
export function recursiveKeyList(record: object, base?: string): string[] {
	let keys: string[] = []

	for (const [key, value] of Object.entries(record)) {
		if (value === undefined) {
			continue
		}

		let basedKey = key
		if (base !== undefined) {
			basedKey = base + '.' + key
		}
		keys.push(basedKey)

		if (typeof value === 'object' && value !== null) {
			keys.push(
				...recursiveKeyList(value, basedKey)
			)
		}
	}

	return keys
}