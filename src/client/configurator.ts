import {
  ProfileEntry,
  ProfileProviderEntry,
  ProviderEntry,
  SuperJsonDocument,
} from '@superfaceai/ast';

import { Config } from '../config';
import { SuperJson } from '../internal';

export class SuperfaceConfigurator {
  private configuration: SuperJson;

  constructor(path?: string) {
    this.configuration = new SuperJson(
      {},
      path ?? Config.instance().superfacePath
    );
  }

  public addProfile(profileName: string, payload: ProfileEntry) {
    this.configuration.setProfile(profileName, payload);

    return this;
  }

  public addProvider(providerName: string, payload?: ProviderEntry) {
    this.configuration.setProvider(providerName, payload ?? {});

    return this;
  }

  public addMap(
    profileName: string,
    providerName: string,
    payload?: ProfileProviderEntry
  ) {
    this.configuration.setProfileProvider(
      profileName,
      providerName,
      payload ?? {}
    );

    return this;
  }

  public build() {
    return this.configuration;
  }

  public fromJSON(json: string | SuperJsonDocument) {
    if (typeof json === 'string') {
      json = JSON.parse(json) as SuperJsonDocument;
    }

    this.configuration = new SuperJson(json, this.configuration.path);

    return this.configuration;
  }
}
