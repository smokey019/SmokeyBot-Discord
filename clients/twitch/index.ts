import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import { getLogger } from "../logger";

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_SECRET_ID;
const authProvider = new RefreshingAuthProvider({
  clientId,
  clientSecret,
});

const api = new ApiClient({ authProvider });
const logger = getLogger('TwitchAPI');

/**
 * Get username with Twitch API
 * @param username
 * @returns
 */
export async function getIDwithUser(username: string): Promise<string | boolean>{

	logger.debug(`Fetching Twitch ID for ${username}.`);

	if (username?.trim() != ''){

		const userID = await api.users.getUserByName(username);

		if (userID){
			return userID.id;
		}else{
			return false;
		}

	}else{
		return false;
	}

}