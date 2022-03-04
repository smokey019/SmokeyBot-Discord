/* eslint-disable @typescript-eslint/no-explicit-any */
import fetch, { BodyInit, RequestInfo } from 'node-fetch';
import { getConfigValue } from '../config';

/**
 * SmokeyBot API Client
 */
class ApiRequest {
  token: string | null;
  headers: object;

  constructor() {
    this.token = getConfigValue('SMOKEYBOT_API_TOKEN');

    this.headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * GET from API
   * @param request URL / Endpoint
   * @returns JSON Response
   */
  async get(request: RequestInfo): Promise<any> {
    const requestHeaders: any = this.headers;
    const response = await fetch(request, {
      method: 'GET',
      headers: requestHeaders,
    });
    const json = await response.json();
    return json;
  }

  /**
   * POST to API
   * @param request URL / Endpoint
   * @param body {}
   * @returns JSON Response
   */
  async post(request: RequestInfo, body: BodyInit): Promise<any> {
    const requestHeaders: any = this.headers;
    const response = await fetch(request, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });
    const json = await response.json();
    return json;
  }
}

export default new ApiRequest();

const api = new ApiRequest();
const apiURL = getConfigValue('API_URL');

export const getPokedexAPI = () => api.get(`${apiURL}/pokemon/pokedex/all`);
/**
 * Get user's monsters by released or not
 * @param id Discord UID
 * @param released 0 = Unreleased only | 1 = Released Only | 3 = All User's Pokemon
 * @returns
 */
export const getMonstersAPI = (id: string, released: 0 | 1 | 3) =>
  api.get(`${apiURL}/pokemon/user/monsters/${id}/${released}/0`);
export const toggleMonsterAPI = (id: string, toggle: number) =>
  api.get(`${apiURL}/pokemon/release/${id}/${toggle}`);
export const selectMonsterAPI = (id: string) =>
  api.get(`${apiURL}/pokemon/select/${id}`);
export const favoriteMonsterAPI = (id: string) =>
  api.get(`${apiURL}/pokemon/favorite/${id}`);
export const unFavoriteMonsterAPI = (id: string) =>
  api.get(`${apiURL}/pokemon/unfavorite/${id}`);
export const getUserAPI = (id: string) =>
  api.get(`${apiURL}/pokemon/user/info/${id}`);
