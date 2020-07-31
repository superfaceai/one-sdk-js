export interface Config {
  auth?: {
    basic?: {
      username: string;
      password: string;
    };
    bearer?: {
      token: string;
    };
  };
}
