import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { UserGameHistory } from '../../games/entities/user-game-history.entity';
import { PushNotification } from '../../notifications/entities/push-notification.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', unique: true }) // Измените на BIGINT
  telegramId: number;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserGameHistory, (history) => history.user)
  gameHistory: UserGameHistory[];

  @OneToMany(() => PushNotification, (notification) => notification.user)
  notifications: PushNotification[];
}
