jest.mock('cross-fetch');
jest.mock('./src/config', () => ({
  ...jest.requireActual('./src/config'),
  disableReporting: true,
}));
