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
