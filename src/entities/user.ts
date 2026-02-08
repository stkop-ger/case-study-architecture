import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { AbstractEntity } from './abstract-entity';

@Entity({ name: 'users' })
export class User extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 50 })
    email!: string;

    @Column({ type: 'varchar', length: 255 })
    password!: string;

    @Column({ type: 'varchar', length: 50 })
    firstName!: string;

    @Column({ type: 'varchar', length: 50 })
    lastName!: string;

    @Column({ name: 'email_confirmed_at', type: 'timestamp', nullable: true })
    emailConfirmedAt!: Date | null;
}
