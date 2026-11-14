import { useState, useEffect } from 'react';
import axios from 'axios';

export const API_VERSION = 'v1';

export interface UserProfile {
    id: string;
    username: string;
    email?: string;
}

export type Status = 'active' | 'inactive' | 'pending';

export class UserService {
    private client: any;

    constructor(client: any) {
        this.client = client;
    }

    public async getUser(id: string): Promise<UserProfile> {
        return this.client.get(`/users/${id}`);
    }

    public static getServiceRole(): string {
        return 'admin';
    }
}

export async function calculateMetrics(data: number[]): Promise<number> {
    return data.reduce((acc, curr) => acc + curr, 0);
}

