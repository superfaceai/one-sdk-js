export interface ICrypto {
  hashString(input: string, algorithm: 'MD5' | 'sha256'): string;
  randomInt(max: number): number;
}
