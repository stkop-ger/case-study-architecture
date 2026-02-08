import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import { User } from '../entities';
import { CreateUsers20260208000000 } from './migrations'

dotenv.config();

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
    entities: [User],
    migrations: [CreateUsers20260208000000],
    synchronize: false,
};

export const AppDataSource = new DataSource(dataSourceOptions);

export const getDataSource = async () => {
    return AppDataSource;
};
