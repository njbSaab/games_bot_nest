import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Game } from './game.entity';

@Entity('user_game_history')
export class UserGameHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.gameHistory, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Game, { onDelete: 'CASCADE' })
  game: Game;

  @CreateDateColumn()
  playedAt: Date;
}
