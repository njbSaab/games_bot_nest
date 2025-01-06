import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './entities/game.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
  ) {}

  // Получить игры для категории
  async findByParentId(parentId: number): Promise<Game[]> {
    return this.gameRepository.find({ where: { parentId } });
  }
}