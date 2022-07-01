// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-var-requires
const packageJson = require('../package.json');

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
export const VERSION: string = packageJson.version;
export const USER_AGENT = `superfaceai one-sdk-js/${VERSION} (${process.platform}-${process.arch}) ${process.release.name}-${process.version}`;
