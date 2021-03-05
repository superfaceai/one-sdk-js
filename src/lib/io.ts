import * as fs from 'fs';

export async function exists(path: string): Promise<boolean> {
	try {
		await fs.promises.access(path);
	} catch (err) {
		if (err.code === 'ENOENT') {
			return false;
		}

		throw err;
	}

	return true;
}