// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-var-requires
const packageJson = require('../package.json');

export * from './client';
export * from './interfaces';
export * from './lib';
export * from './internal';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
export const VERSION: string = packageJson.version;
