import { Container } from 'inversify';

import './src/lib/base-controller';
import './src/controllers';

import { UserService, UserServiceImpl } from './src/services';
import { UserRepository, UserRepositoryImpl } from './src/repositories';

import { TYPES } from './src/lib';

export const diContainer = new Container();

// bind services
diContainer.bind<UserService>(TYPES.UserService).to(UserServiceImpl);

// bind repositories
diContainer.bind<UserRepository>(TYPES.UserRepository).to(UserRepositoryImpl);
