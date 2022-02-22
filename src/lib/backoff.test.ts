import { ConstantBackoff, ExponentialBackoff, LinearBackoff } from './backoff';

describe('backoff', () => {
  describe('constant backoff', () => {
    it('stays the same', () => {
      const backoff = new ConstantBackoff(1234);
      expect(backoff.current).toBe(1234);

      expect(backoff.up()).toBe(1234);
      expect(backoff.up()).toBe(1234);

      expect(backoff.down()).toBe(1234);
      expect(backoff.down()).toBe(1234);
      expect(backoff.down()).toBe(1234);

      expect(backoff.up()).toBe(1234);

      expect(backoff.down()).toBe(1234);

      expect(backoff.current).toBe(1234);
    });
  });

  describe('linear backoff', () => {
    it('goes up and down linearily', () => {
      const backoff = new LinearBackoff(100, 10);
      expect(backoff.current).toBe(100);

      expect(backoff.up()).toBe(110);
      expect(backoff.up()).toBe(120);

      expect(backoff.down()).toBe(110);
      expect(backoff.down()).toBe(100);
      expect(backoff.down()).toBe(90);

      expect(backoff.up()).toBe(100);

      expect(backoff.down()).toBe(90);

      expect(backoff.current).toBe(90);
    });
  });

  describe('exponential backoff', () => {
    it('goes up exponentially', () => {
      const backoff = new ExponentialBackoff(1, 2.0);
      expect(backoff.current).toBe(1);
      expect(backoff.current).toBe(1);

      expect(backoff.up()).toBe(2);
      expect(backoff.up()).toBe(4);
      expect(backoff.up()).toBe(8);
      expect(backoff.up()).toBe(16);
      expect(backoff.up()).toBe(32);
      expect(backoff.up()).toBe(64);
      expect(backoff.up()).toBe(128);

      expect(backoff.current).toBe(128);
    });

    it('goes down exponentially', () => {
      const backoff = new ExponentialBackoff(1024, 2.0);
      expect(backoff.current).toBe(1024);

      expect(backoff.down()).toBe(512);
      expect(backoff.down()).toBe(256);
      expect(backoff.down()).toBe(128);
      expect(backoff.down()).toBe(64);
      expect(backoff.down()).toBe(32);
      expect(backoff.down()).toBe(16);
      expect(backoff.down()).toBe(8);

      expect(backoff.current).toBe(8);
    });

    it('goes up and down exponentionally', () => {
      const backoff = new ExponentialBackoff(1024, 2.0);
      expect(backoff.current).toBe(1024);

      expect(backoff.up()).toBe(2048);
      expect(backoff.up()).toBe(4096);

      expect(backoff.down()).toBe(2048);
      expect(backoff.down()).toBe(1024);
      expect(backoff.down()).toBe(512);

      expect(backoff.up()).toBe(1024);

      expect(backoff.down()).toBe(512);

      expect(backoff.current).toBe(512);
    });
  });
});
