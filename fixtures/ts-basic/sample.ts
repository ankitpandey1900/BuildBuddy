import { useState, useEffect } from 'react';
import axios from 'axios';
import { BaseService } from './base';
import type { IService } from './types';

export const API_VERSION = 'v1';

export interface UserProfile {
    id: string;
    username: string;
    email?: string;
}

export type Status = 'active' | 'inactive' | 'pending';

export class UserService extends BaseService implements IService {
    private client: any;

    constructor(client: any) {
        super();
        this.client = client;
    }

    public async getUser(id: string): Promise<UserProfile> {
        return this.client.get(`/users/${id}`);
    }

    public static getServiceRole(): string {
        return 'admin';
    }
}

export async function calculateMetrics(data: number[] = []): Promise<number> {
    function sum(a: number, b: number): number {
        return a + b;
    }
    return data.reduce(sum, 0);
}

export const processUser = async (id: string = 'guest'): Promise<string> => {
    return `user:${id}`;
};

const INTERNAL_SECRET = 'secret_token';
export { INTERNAL_SECRET };
export default UserService;

