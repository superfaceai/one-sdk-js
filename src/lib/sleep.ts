export async function sleep(ms: number): Promise<void> {
	return new Promise(
		(resolve, _reject) => {
			setTimeout(
				() => resolve(),
				ms
			)
		}
	)
}
