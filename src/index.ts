import packageJson from '../package.json';

export * from './client';
export * from './interfaces';
export * from './lib';
export * from './internal';

export const VERSION = packageJson.version;
