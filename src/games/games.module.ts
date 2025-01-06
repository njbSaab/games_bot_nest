import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { Game } from './entities/game.entity';
import { UserGameHistory } from './entities/user-game-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Game, UserGameHistory])],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
