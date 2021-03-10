import { SuperJson } from "../../internal";
import { exists } from "../../lib/io";
import { BoundProfileProvider, ProfileProvider } from "../query";
import { Profile, ProfileConfiguration } from "./profile";
import { Provider, ProviderConfiguration } from './provider';

/**
 * Cache for loaded super.json files so that they aren't reparsed each time a new superface client is created.
 */
const SUPER_CACHE: { [path: string]: SuperJson } = {};

export class SuperfaceClient {
	public readonly superJson: SuperJson;
	private boundCache: {
		[key: string]: BoundProfileProvider
	} = {};
	
	constructor() {
		// TODO: Load and cache, synchronizedly
		this.superJson = new SuperJson({});
	}

	/** Gets a profile from super.json based on `profileId` in format: `[scope/]name`. */
	async getProfile(profileId: string): Promise<Profile> {
		const profileSettings = this.superJson.normalized.profiles[profileId];
		if (profileSettings === undefined) {
			throw new Error(`Profile "${profileId}" is not installed. Please install it by running \`superface install ${profileId}\`.`);
		}

		let version;
		if ('file' in profileSettings) {
			if (!await exists(profileSettings.file)) {
				throw new Error(`File "${profileSettings.file}" specified in super.json does not exist.`);
			}

			// TODO: read version from the ast?
			version = "unknown";
		} else {
			version = profileSettings.version;
		}
		
		return new Profile(
			this,
			profileId,
			new ProfileConfiguration(version, profileSettings.defaults, profileSettings.providers)
		);
	}

	/** Gets a provider from super.json based on `providerName`. */
	async getProvider(providerName: string): Promise<Provider> {
		const providerSettings = this.superJson.normalized.providers[providerName];

		return new Provider(
			this,
			providerName,
			new ProviderConfiguration(providerSettings.file, providerSettings.auth)
		);
	}

	get profiles(): never {
		throw 'TODO'
	}

	get providers(): never {
		throw 'TODO'
	}

	async cacheBoundProfileProvider(
		profileConfig: ProfileConfiguration,
		providerConfig: ProviderConfiguration
	): Promise<BoundProfileProvider> {
		const cacheKey = profileConfig.cacheKey + providerConfig.cacheKey;

		const bound = this.boundCache[cacheKey];
		if (bound === undefined) {
			const profileProvider = new ProfileProvider(
				profileConfig,
				providerConfig
			);
			const boundProfileProvider = await profileProvider.bind();
			this.boundCache[cacheKey] = boundProfileProvider;
		}

		return this.boundCache[cacheKey];
	}
}