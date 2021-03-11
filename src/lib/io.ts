import { promises as fsp } from 'fs';

export async function exists(path: string): Promise<boolean> {
	try {
		await fsp.access(path);
	} catch (err) {
		if (err.code === 'ENOENT') {
			return false;
		}

		throw err;
	}

	return true;
}