import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createOrUpdateUser(data: { telegramId: number; username?: string; firstName?: string; lastName?: string }) {
    this.logger.log(`Creating or updating user: ${JSON.stringify(data)}`);
  
    try {
      const existingUser = await this.userRepository.findOne({ where: { telegramId: data.telegramId } });
  
      if (existingUser) {
        this.logger.log(`User already exists: ${JSON.stringify(existingUser)}. Updating...`);
        const updatedUser = await this.userRepository.save({ ...existingUser, ...data });
        this.logger.log(`User updated: ${JSON.stringify(updatedUser)}`);
        return updatedUser; // Возвращаем обновленного пользователя
      } else {
        this.logger.log(`User does not exist. Creating new user.`);
        const newUser = this.userRepository.create(data);
        const savedUser = await this.userRepository.save(newUser);
        this.logger.log(`User created: ${JSON.stringify(savedUser)}`);
        return savedUser; // Возвращаем созданного пользователя
      }
    } catch (error) {
      this.logger.error(`Error in createOrUpdateUser: ${error.message}`, error.stack);
      throw error;
    }
  }
}
