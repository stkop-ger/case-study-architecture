import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';
import path from 'path';

import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

dotenv.config();

const getParametersFromSSM = async () => {
    try {
        const ssmClient = new SSMClient({ region: 'eu-central-1' });

        const input = {
            Names: [
                'k8s_rds_host',
                'k8s_rds_db_name',
                'k8s_rds_master_username',
                'k8s_rds_master_password',
            ],
            WithDecryption: true,
        };

        const command = new GetParametersCommand(input);

        const response = await ssmClient.send(command);

        const envVars: any = {};

        if (response.Parameters) {
            for (const p of response.Parameters) {
                envVars[p.Name!] = p.Value;
            }
        }

        return envVars;
    } catch (error: any) {
        console.log('Failed to read parameters from SSM with error: ', error);
    }
};

// Configuration for Datasource

const parsePort = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const dataSourceOptions: PostgresConnectionOptions = {
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parsePort(process.env.DATABASE_PORT, 5432),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'case_study_db',
    entities: [path.join(__dirname, 'entities/**/*{.ts,.js}')],
    migrations: [path.join(__dirname, 'entities/migrations/*{.ts,.js}')],
    synchronize: false,
};

export const AppDataSource = new DataSource(dataSourceOptions);

export const getDataSource = async () => {
    if (process.env.USE_SSM === 'true') {
        const ssmVars = (await getParametersFromSSM()) || {};

        return new DataSource({
            ...dataSourceOptions,
            host: ssmVars.k8s_rds_host || dataSourceOptions.host,
            database: ssmVars.k8s_rds_db_name || dataSourceOptions.database,
            username:
                ssmVars.k8s_rds_master_username || dataSourceOptions.username,
            password:
                ssmVars.k8s_rds_master_password || dataSourceOptions.password,
        });
    }

    return AppDataSource;
};
