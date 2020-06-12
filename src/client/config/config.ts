export interface Config {
  credentials?: {
    basic?: {
      username: string;
      password: string;
    };
    bearer?: {
      token: string;
    };
  };
}
