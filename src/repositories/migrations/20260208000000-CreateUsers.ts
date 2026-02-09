import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUsers20260208000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        await queryRunner.createTable(
            new Table({
                name: 'users',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'email',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'password',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'firstName',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'lastName',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'email_confirmed_at',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'createdAt',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'updatedAt',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'deletedAt',
                        type: 'timestamp',
                        isNullable: true,
                    },
                ],
            }),
            true,
        );

        await queryRunner.createIndices('users', [
            new TableIndex({
                name: 'IDX_USERS_EMAIL_UNIQUE',
                columnNames: ['email'],
                isUnique: true,
            }),
            new TableIndex({
                name: 'IDX_USERS_FIRST_NAME',
                columnNames: ['firstName'],
            }),
            new TableIndex({
                name: 'IDX_USERS_LAST_NAME',
                columnNames: ['lastName'],
            }),
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('users', 'IDX_USERS_LAST_NAME');
        await queryRunner.dropIndex('users', 'IDX_USERS_FIRST_NAME');
        await queryRunner.dropIndex('users', 'IDX_USERS_EMAIL_UNIQUE');
        await queryRunner.dropTable('users');
        await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
    }
}
